extends SceneTree

## Regression for the v0.3.1 walk/stop/sprint/charge presentation contract.

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
	if not _check(main.bridge_ready and main.simulation.has_method("advance_actions"), "v0.3.1 action bridge was not loaded"):
		return
	var initial: Dictionary = main.simulation.snapshot()
	if not _check(str(initial.get("simulation_version", "")) == "campo-native-0.3.1", "native simulation version is not 0.3.1"):
		return
	main.set_physics_process(false)
	main.simulation.reset_match()
	var state: Dictionary = main.simulation.snapshot()
	var walk_start: Vector3 = state.get("player_position", Vector3.ZERO)
	for _walk_tick in range(180):
		state = _step(main, 1.0, 0.0, false, false, false, false, false)
	var walk_distance := walk_start.distance_to(state.get("player_position", walk_start))
	var walk_speed := _horizontal_speed(state)
	if not capture_path.is_empty():
		await _capture_pose(main, state, capture_path)
	if not _check(walk_speed <= 6.67 + 0.1, "walk exceeded the normal speed cap"):
		return
	var ball_distance_before_stop := _horizontal_distance(state, "player_position", "ball_position")
	var stopped_position: Vector3 = state.get("player_position", Vector3.ZERO)
	for _stop_tick in range(120):
		state = _step(main, 0.0, 0.0, false, false, false, false, false)
	var stop_distance := stopped_position.distance_to(state.get("player_position", stopped_position))
	var stop_ball_distance := _horizontal_distance(state, "player_position", "ball_position")
	if not _check(_horizontal_speed(state) < 0.25 and stop_distance < 0.4, "walk did not settle after 120 idle ticks"):
		return
	if not _check(stop_ball_distance <= 1.2, "stopping lost the ball beyond the training touch range"):
		return
	main.simulation.reset_match()
	var walk_compare_start: Vector3 = main.simulation.snapshot().get("player_position", Vector3.ZERO)
	for _walk_compare_tick in range(120):
		state = _step(main, 1.0, 0.0, false, false, false, false, false)
	var walk_compare_distance := walk_compare_start.distance_to(state.get("player_position", walk_compare_start))
	main.simulation.reset_match()
	var sprint_start: Vector3 = main.simulation.snapshot().get("player_position", Vector3.ZERO)
	for _sprint_tick in range(120):
		state = _step(main, 1.0, 0.0, true, false, false, false, false)
	var sprint_distance := sprint_start.distance_to(state.get("player_position", sprint_start))
	if not _check(sprint_distance >= walk_compare_distance * 2.0, "Shift sprint did not reach twice the walk distance"):
		return
	if not _check(_horizontal_speed(state) <= 9.775 + 0.1, "sprint exceeded the speed cap"):
		return
	main.simulation.reset_match()
	state = main.simulation.snapshot()
	for _approach_tick in range(90):
		state = _step(main, 1.0, 0.0, false, false, false, false, false)
	var speed_before_charge := _horizontal_speed(state)
	var charge_seen := false
	var charge_min_speed := speed_before_charge
	var kick_pose_seen := false
	var charge_capture_state: Dictionary = {}
	var speed_at_charge_tick_60 := INF
	var settled_position := Vector3.ZERO
	var striking_entries := 0
	var was_striking := false
	var impulses := 0
	var previous_vertical_speed := 0.0
	var thigh: int = main.player_visual.skeleton.find_bone("thigh_r")
	for charge_tick in range(200):
		state = _step(main, 1.0, 0.0, false, true, false, false, false)
		charge_seen = charge_seen or float(state.get("charge", 0.0)) > 0.0
		if charge_tick == 59:
			charge_capture_state = state.duplicate(true)
		charge_min_speed = minf(charge_min_speed, _horizontal_speed(state))
		kick_pose_seen = kick_pose_seen or main.player_visual.active_clip_name == "kick"
		if charge_tick == 59:
			speed_at_charge_tick_60 = _horizontal_speed(state)
			settled_position = state.get("player_position", Vector3.ZERO)
		var striking := bool(state.get("striking", false))
		if striking and not was_striking:
			striking_entries += 1
		was_striking = striking
		var vertical_speed: float = state.ball_velocity.y
		if striking and vertical_speed > previous_vertical_speed + 1.0:
			impulses += 1
		previous_vertical_speed = vertical_speed
	if not _check(charge_seen, "shoot charge did not begin while walking"):
		return
	if not _check(speed_at_charge_tick_60 < 0.1, "charging body was still moving at tick 60"):
		return
	var charge_post_settle_drift := settled_position.distance_to(state.get("player_position", settled_position))
	if not _check(charge_post_settle_drift < 0.2, "charging body slid %.3fm after it had settled" % charge_post_settle_drift):
		return
	if not _check(kick_pose_seen and thigh >= 0, "charging did not select a coherent kick pose"):
		return
	if not _check(float(state.get("charge", 1.0)) == 0.0 and not bool(state.get("striking", false)), "charge did not auto-release"):
		return
	if not _check(striking_entries == 1 and impulses == 1, "charge must produce exactly one gesture and one ball impulse"):
		return
	if not capture_path.is_empty() and not charge_capture_state.is_empty():
		main._apply_state(charge_capture_state)
		await _capture_pose(main, charge_capture_state, capture_path.get_basename() + "-charge." + capture_path.get_extension())
	print("locomotion_visual.gd: PASS (walk %.2fm/120, stop %.2fm, sprint %.2fm/120, charge tick60 %.2fm/s, strike entries %d)" % [walk_compare_distance, stop_distance, sprint_distance, speed_at_charge_tick_60, striking_entries])
	quit(0)


func _step(main: Node, x: float, z: float, sprint: bool, shoot: bool, cancel: bool, pass_action: bool, tackle: bool) -> Dictionary:
	var state: Dictionary = main.simulation.call("advance_actions", x, z, sprint, shoot, cancel, pass_action, tackle)
	main._apply_state(state)
	return state


func _horizontal_speed(state: Dictionary) -> float:
	var velocity: Vector3 = state.get("player_velocity", Vector3.ZERO)
	return Vector2(velocity.x, velocity.z).length()


func _horizontal_distance(state: Dictionary, first_key: String, second_key: String) -> float:
	var first: Vector3 = state.get(first_key, Vector3.ZERO)
	var second: Vector3 = state.get(second_key, Vector3.ZERO)
	return Vector2(first.x - second.x, first.z - second.z).length()


func _capture_pose(main: Node, state: Dictionary, path: String) -> void:
	var focus: Vector3 = state.get("player_position", Vector3.ZERO)
	main.set_process(false)
	main.set_physics_process(false)
	main.camera_target = focus
	main.camera.position = focus + Vector3(0.0, 8.0, 11.0)
	main.camera.look_at(focus, Vector3.UP)
	main.camera.size = 12.0
	await RenderingServer.frame_post_draw
	var image := main.get_viewport().get_texture().get_image()
	if image == null or image.save_png(path) != OK:
		_check(false, "could not save locomotion capture: " + path)
	main.set_process(true)
	main.set_physics_process(true)


func _check(condition: bool, message: String) -> bool:
	if condition:
		return true
	push_error("locomotion_visual.gd: " + message)
	quit(1)
	return false
