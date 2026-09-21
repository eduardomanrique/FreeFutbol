extends SceneTree

## Client integration checks for the Rust-owned native 2v1 snapshot.

var capture_path := ""

func _init() -> void:
	call_deferred("_run")


func _run() -> void:
	for argument in OS.get_cmdline_user_args():
		if argument.begins_with("--capture="):
			capture_path = argument.trim_prefix("--capture=")
	var main: Node = load("res://main.tscn").instantiate()
	root.add_child(main)
	await process_frame
	await process_frame
	if not _check(main.bridge_ready, "CampoSimulation bridge was not loaded"):
		return
	if not _check(main.simulation.has_method("advance_actions"), "v0.3 advance_actions is not available"):
		return
	if not _check(main.teammate_visual != null and main.defender_visual != null, "2v1 visual actors were not created"):
		return
	var initial: Dictionary = main.simulation.snapshot()
	var teammate: Dictionary = initial.get("teammate", {})
	var defender: Dictionary = initial.get("defender", {})
	if not _check(_has_actor_pose(teammate) and _has_actor_pose(defender), "snapshot lacks teammate/defender pose dictionaries"):
		return
	if not _check(main.teammate_visual.team_color == Color("#d9423d"), "teammate kit color is not red"):
		return
	if not _check(main.defender_visual.team_color == Color("#2674c9"), "defender kit color is not blue"):
		return
	if not _check(main.teammate_visual.visible and main.defender_visual.visible, "2v1 actors were not made visible"):
		return
	if not capture_path.is_empty():
		await _capture_scene(main, initial, capture_path)
	var first_tick := int(initial.get("tick", -1))
	for _step in range(8):
		main.simulation.call("advance_actions", 0.0, 0.0, false, false, false, false, false)
	var stepped: Dictionary = main.simulation.snapshot()
	if not _check(int(stepped.get("tick", -1)) > first_tick, "advance_actions did not advance the core"):
		return
	if not _check(int(stepped.get("possession", -2)) >= -1 and int(stepped.get("possession", -2)) <= 2, "invalid possession enum"):
		return
	if not _check(int(stepped.get("passes_completed", -1)) >= 0 and int(stepped.get("tackles_won", -1)) >= 0, "missing 2v1 counters"):
		return
	# J charges the same authoritative action meter as a pass intent.
	main.simulation.reset_match()
	main.current_state = main.simulation.snapshot()
	main._apply_state(main.current_state)
	await _key(KEY_J, true)
	await _physics_frames(20)
	var charging: Dictionary = main.simulation.snapshot()
	if not _check(float(charging.get("charge", 0.0)) > 0.0, "J did not charge a pass"):
		return
	# Pausing while J is held must cancel the action and prevent a release pass.
	await _key(KEY_ESCAPE, true)
	await _key(KEY_ESCAPE, false)
	if not _check(main.get_tree().paused, "pause did not engage during pass charge"):
		return
	var paused_tick := int(main.simulation.snapshot().get("tick", -1))
	await _physics_frames(8)
	if not _check(int(main.simulation.snapshot().get("tick", -1)) == paused_tick, "paused pass advanced the core"):
		return
	await _key(KEY_J, false)
	var cancelled: Dictionary = main.simulation.snapshot()
	if not _check(is_zero_approx(float(cancelled.get("charge", 1.0))), "pause did not cancel pass charge"):
		return
	await _key(KEY_ESCAPE, true)
	await _key(KEY_ESCAPE, false)
	await _physics_frames(20)
	if not _check(int(main.simulation.snapshot().get("passes_completed", -1)) == 0, "cancelled pass was received"):
		return
	var cancelled_velocity: Vector3 = main.simulation.snapshot().get("ball_velocity", Vector3.ZERO)
	if not _check(cancelled_velocity.length() < 0.5, "cancelled pass launched the ball"):
		return
	# Repeat the real scene path: hold/release J, then wait for teammate contact.
	main.simulation.reset_match()
	main.current_state = main.simulation.snapshot()
	main._apply_state(main.current_state)
	var target_start: Vector3 = main.current_state.teammate.player_position
	await _key(KEY_J, true)
	await _physics_frames(30)
	await _key(KEY_J, false)
	var before_pass: Dictionary = main.simulation.snapshot()
	var received := false
	var aimed_at_teammate := false
	var received_state: Dictionary = {}
	for _pass_tick in range(360):
		await physics_frame
		var pass_state: Dictionary = main.simulation.snapshot()
		var ball_position: Vector3 = pass_state.get("ball_position", Vector3.ZERO)
		var ball_velocity: Vector3 = pass_state.get("ball_velocity", Vector3.ZERO)
		var target_direction := target_start - ball_position
		if ball_velocity.length() > 2.0 and target_direction.length() > 0.001 and ball_velocity.normalized().dot(target_direction.normalized()) > 0.65:
			aimed_at_teammate = true
		if int(pass_state.get("passes_completed", 0)) > int(before_pass.get("passes_completed", 0)):
			received = true
			received_state = pass_state
			break
	if not _check(aimed_at_teammate, "pass velocity was not directed toward teammate"):
		return
	if not _check(received, "teammate did not receive the authoritative pass"):
		return
	if not capture_path.is_empty():
		await _capture_scene(main, received_state, capture_path.get_basename() + "-receive." + capture_path.get_extension())
	# K must reach the same fixed-step bridge path; tackle outcome remains core-owned.
	var before_input: Dictionary = main.simulation.snapshot()
	await _key(KEY_K, true)
	await _physics_frames(4)
	await _key(KEY_K, false)
	var after_input: Dictionary = main.simulation.snapshot()
	if not _check(int(after_input.get("tick", -1)) > int(before_input.get("tick", -2)), "K input did not reach the fixed simulation"):
		return
	# Direct calls above prove the new action ABI; the scene fixture proves J/K
	# are accepted without changing the visual actor topology.
	print("2v1_visual.gd: PASS (three actors, teammate/defender poses, pass/tackle ABI, possession and counters)")
	quit(0)


func _has_actor_pose(actor: Dictionary) -> bool:
	for key in ["player_position", "player_velocity", "facing", "left_foot", "right_foot", "charge", "shot_phase", "striking", "tick"]:
		if not actor.has(key):
			return false
	return true


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


func _capture_scene(main: Node, state: Dictionary, path: String) -> void:
	var player_position: Vector3 = state.get("player_position", Vector3.ZERO)
	var teammate_state: Dictionary = state.get("teammate", {})
	var defender_state: Dictionary = state.get("defender", {})
	var teammate_position: Vector3 = teammate_state.get("player_position", player_position)
	var defender_position: Vector3 = defender_state.get("player_position", player_position)
	var focus := (player_position + teammate_position + defender_position) / 3.0
	main.set_process(false)
	main.set_physics_process(false)
	main.camera_target = focus
	main.camera.position = focus + Vector3(0.0, 8.0, 11.0)
	main.camera.look_at(focus, Vector3.UP)
	# The three initial positions span the depth of the broadcast camera; keep
	# this diagnostic framing wide enough to show every actor and the ball.
	main.camera.size = 18.0
	await RenderingServer.frame_post_draw
	var image := main.get_viewport().get_texture().get_image()
	if image == null or image.save_png(path) != OK:
		_check(false, "could not save 2v1 capture: " + path)
	main.set_process(true)
	main.set_physics_process(true)


func _check(condition: bool, message: String) -> bool:
	if condition:
		return true
	push_error("2v1_visual.gd: " + message)
	quit(1)
	return false
