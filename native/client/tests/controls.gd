extends SceneTree

## Headless contract test for the presentation client and Rust bridge.
##
## It drives the real scene through Input.parse_input_event, then inspects the
## bridge snapshot. No renderer state is used as gameplay evidence.

var main_scene: Node
var failed := false


func _init() -> void:
	call_deferred("_run")


func _run() -> void:
	main_scene = load("res://main.tscn").instantiate()
	root.add_child(main_scene)
	await process_frame
	await process_frame

	if not _check(main_scene.bridge_ready, "CampoSimulation bridge was not loaded"):
		return
	var simulation: Object = main_scene.simulation
	if not _check(simulation != null, "main scene did not create its simulation"):
		return

	var initial: Dictionary = simulation.snapshot()
	if not _check(int(initial.get("tick", -1)) >= 0, "initial snapshot has no tick"):
		return

	if not _check(initial.has("left_foot") and initial.has("right_foot"), "authoritative foot pose is absent"):
		return
	var simulation_version: String = str(initial.get("simulation_version", ""))
	var expected_version := "campo-native-0.3.1" if simulation.has_method("advance_actions") else "campo-native-0.2.0"
	if not _check(simulation_version == expected_version, "native simulation version mismatch: %s (expected %s)" % [simulation_version, expected_version]):
		return
	var original_camera: bool = main_scene.close_camera
	await _key(KEY_C, true)
	await _key(KEY_C, false)
	if not _check(main_scene.close_camera != original_camera, "C did not switch camera"):
		return
	await _key(KEY_C, true)
	await _key(KEY_C, false)

	# Movement comes through the scene's keyboard reader and advances physics.
	await _key(KEY_D, true)
	await _physics_frames(18)
	await _key(KEY_D, false)
	var moved: Dictionary = simulation.snapshot()
	if not _check(int(moved.tick) > int(initial.tick), "D did not advance the fixed simulation"):
		return
	if not _check(_vector_x(moved, "player_position") > _vector_x(initial, "player_position"), "D did not move the player"):
		return
	# Start the action assertions from a clean kickoff so an earlier movement
	# touch cannot be mistaken for a shot launched after resume.
	await _key(KEY_R, true)
	await _key(KEY_R, false)

	# Hold a shot long enough to expose charge, then pause. Pausing must cancel
	# the bridge action and stop ticks while the tree remains paused.
	await _key(KEY_SPACE, true)
	await _physics_frames(12)
	var charging: Dictionary = simulation.snapshot()
	if not _check(float(charging.charge) > 0.0, "Space did not charge a shot"):
		return
	await _key(KEY_ESCAPE, true)
	await _key(KEY_ESCAPE, false)
	if not _check(paused, "Escape did not pause the scene tree"):
		return
	var tick_before_pause := int(simulation.snapshot().tick)
	await _physics_frames(12)
	var paused_state: Dictionary = simulation.snapshot()
	if not _check(int(paused_state.tick) == tick_before_pause, "paused physics advanced the simulation (%d -> %d)" % [tick_before_pause, int(paused_state.tick)]):
		return
	if not _check(is_zero_approx(float(paused_state.charge)), "pause did not cancel shot charge"):
		return

	# Releasing the held key while paused and resuming must not create a shot.
	await _key(KEY_SPACE, false)
	await _key(KEY_ESCAPE, true)
	await _key(KEY_ESCAPE, false)
	if not _check(not paused, "Escape did not resume the scene tree"):
		return
	await _physics_frames(16)
	var resumed: Dictionary = simulation.snapshot()
	if not _check(is_zero_approx(float(resumed.charge)), "resume restored a cancelled charge"):
		return
	var ball_velocity := resumed.get("ball_velocity", Vector3.ZERO) as Vector3
	if not _check(ball_velocity.length() < 0.5, "cancelled release launched the ball"):
		return

	# A focus loss must pause and cancel without requiring a keyboard release.
	await _key(KEY_SPACE, true)
	await _physics_frames(8)
	main_scene._notification(Node.NOTIFICATION_APPLICATION_FOCUS_OUT)
	if not _check(paused and is_zero_approx(float(simulation.snapshot().charge)), "focus loss did not pause and cancel"):
		return
	await _key(KEY_SPACE, false)
	await _key(KEY_ESCAPE, true)
	await _key(KEY_ESCAPE, false)

	# Freeze automatic stepping so the reset assertion does not depend on render timing.
	main_scene.set_physics_process(false)
	# R resets through the scene input handler and leaves a fresh kickoff.
	await _key(KEY_R, true)
	await _key(KEY_R, false)
	var reset_state: Dictionary = simulation.snapshot()
	if not _check(int(reset_state.tick) == 0, "R did not reset the simulation tick"):
		return
	if not _check(is_zero_approx(float(reset_state.charge)), "R left charge armed"):
		return
	if not _check(is_equal_approx(_vector_x(reset_state, "player_position"), -20.0), "R did not restore the player kickoff"):
		return
	if not _check(is_equal_approx(_vector_x(reset_state, "ball_position"), -19.1), "R did not restore the ball kickoff"):
		return

	# Two bridge objects with identical intents must produce identical snapshots.
	var first: Object = ClassDB.instantiate("CampoSimulation")
	var second: Object = ClassDB.instantiate("CampoSimulation")
	if not _check(first != null and second != null, "could not create deterministic bridge pair"):
		return
	var commands := [
		[1.0, 0.0, false, false, false],
		[1.0, 0.0, true, false, false],
		[0.0, 0.0, false, true, false],
		[0.0, 0.0, false, false, false],
		[0.0, 0.0, false, false, true],
		[-0.5, 0.25, false, false, false],
	]
	for command in commands:
		for _step in range(8):
			if first.has_method("advance_actions"):
				first.call("advance_actions", command[0], command[1], command[2], command[3], command[4], false, false)
				second.call("advance_actions", command[0], command[1], command[2], command[3], command[4], false, false)
			else:
				first.advance(command[0], command[1], command[2], command[3], command[4])
				second.advance(command[0], command[1], command[2], command[3], command[4])
		if not _check_snapshots_equal(first.snapshot(), second.snapshot(), "bridge pair diverged"):
			return

	print("controls.gd: PASS")
	quit(0)


func _key(keycode: Key, pressed: bool) -> void:
	var event := InputEventKey.new()
	event.keycode = keycode
	event.physical_keycode = keycode
	event.pressed = pressed
	event.echo = false
	Input.parse_input_event(event)
	await process_frame


func _physics_frames(count: int) -> void:
	for _frame in count:
		await physics_frame


func _vector_x(snapshot: Dictionary, key: String) -> float:
	var value := snapshot.get(key, Vector3.ZERO) as Vector3
	return value.x


func _check_snapshots_equal(first: Dictionary, second: Dictionary, message: String) -> bool:
	if int(first.get("tick", -1)) != int(second.get("tick", -2)):
		return _check(false, message + " (tick)")
	if first.get("shot_phase") != second.get("shot_phase") or first.get("striking") != second.get("striking"):
		return _check(false, message + " (gesture)")
	if int(first.get("goals", -1)) != int(second.get("goals", -2)):
		return _check(false, message + " (goals)")
	if float(first.get("charge", -1.0)) != float(second.get("charge", -2.0)):
		return _check(false, message + " (charge)")
	for key in ["possession", "passes_completed", "tackles_won"]:
		if first.get(key) != second.get(key):
			return _check(false, message + " (" + key + ")")
	for key in ["player_position", "player_velocity", "facing", "ball_position", "ball_velocity", "left_foot", "right_foot"]:
		var left := first.get(key, Vector3.INF) as Vector3
		var right := second.get(key, Vector3.ZERO) as Vector3
		if left != right:
			return _check(false, message + " (" + key + ")")
	for actor_name in ["teammate", "defender"]:
		var left_actor: Dictionary = first.get(actor_name, {})
		var right_actor: Dictionary = second.get(actor_name, {})
		for key in ["player_position", "player_velocity", "facing", "left_foot", "right_foot", "shot_phase", "striking", "charge", "tick"]:
			if left_actor.get(key) != right_actor.get(key):
				return _check(false, message + " (" + actor_name + "." + key + ")")
	return true


func _check(condition: bool, message: String) -> bool:
	if condition:
		return true
	failed = true
	push_error("controls.gd: " + message)
	quit(1)
	return false
