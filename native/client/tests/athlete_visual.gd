extends SceneTree

## Verifies that the native scene presents the imported Quaternius rig rather
## than the old procedural placeholder, and that a core pose changes bones.

func _init() -> void:
	call_deferred("_run")


func _run() -> void:
	var main: Node = load("res://main.tscn").instantiate()
	root.add_child(main)
	await process_frame
	await process_frame
	if not _check(main.bridge_ready, "CampoSimulation bridge was not loaded"):
		return
	var athlete = main.player_visual
	if not _check(athlete != null and athlete.asset_ready, "Quaternius athlete asset was not loaded"):
		return
	if not _check(athlete.skeleton != null, "imported athlete has no Skeleton3D"):
		return
	var hair: Node = athlete.model.find_child("QuaterniusHair", true, false)
	if not _check(hair != null and hair.get_parent() is BoneAttachment3D, "hair is not attached to Head"):
		return
	var meshes: Array[Node] = athlete.find_children("*", "MeshInstance3D", true, false)
	if not _check(meshes.size() > 0, "imported athlete has no mesh instances"):
		return
	if not _check(athlete.motion_values.size() > 0 and athlete.motion_indices.size() == 65, "retargeted motion data was not loaded"):
		return
	var thigh: int = athlete.skeleton.find_bone("thigh_l")
	if not _check(thigh >= 0, "left thigh bone is missing"):
		return
	var idle := {
		"tick": 0,
		"player_velocity": Vector3.ZERO,
		"charge": 0.0,
		"striking": false,
		"shot_phase": 0.0,
		"left_foot": main.simulation.snapshot().get("left_foot", Vector3(-0.1, 0.05, 0.0)),
		"right_foot": main.simulation.snapshot().get("right_foot", Vector3(0.1, 0.05, 0.0)),
	}
	athlete.apply_pose(idle)
	var idle_pose: Quaternion = athlete.skeleton.get_bone_pose_rotation(thigh)
	var moving := idle.duplicate(true)
	moving.tick = 110
	moving.player_velocity = Vector3(6.5, 0.0, 0.0)
	athlete.apply_pose(moving)
	var moving_pose: Quaternion = athlete.skeleton.get_bone_pose_rotation(thigh)
	if not _check(not idle_pose.is_equal_approx(moving_pose), "locomotion did not change an imported bone pose"):
		return
	var next_moving := moving.duplicate(true)
	next_moving.tick = 111
	athlete.apply_pose(next_moving)
	var interpolated_pose: Quaternion = athlete.skeleton.get_bone_pose_rotation(thigh)
	if not _check(not moving_pose.is_equal_approx(interpolated_pose), "locomotion frame interpolation did not advance"):
		return
	var stable_pose: Quaternion = interpolated_pose
	athlete.apply_pose(next_moving)
	if not _check(stable_pose.is_equal_approx(athlete.skeleton.get_bone_pose_rotation(thigh)), "same input accumulated a visual pose overlay"):
		return
	main.set_process(false)
	main.set_physics_process(false)
	main.simulation.reset_match()
	var support_seen := false
	var support_stable := false
	var support_repeat_stable := false
	var support_drift_max := 0.0
	var support_samples := 0
	var last_support_side := ""
	var last_support_anchor := Vector3.ZERO
	var last_support_foot := Vector3.ZERO
	var movement_state: Dictionary = {}
	for _movement_tick in range(100):
		movement_state = main.simulation.advance(1.0, 0.0, false, false, false)
		athlete.position = movement_state.player_position
		athlete.apply_pose(movement_state)
		if athlete.support_anchor_active:
			var support_bone := "ball_l" if athlete.support_side == "left" else "ball_r"
			var actual_support_foot: Vector3 = athlete._bone_world_position(support_bone)
			var same_anchor: bool = support_seen and athlete.support_side == last_support_side and athlete.support_anchor_world.distance_to(last_support_anchor) < 0.001
			if same_anchor:
				support_samples += 1
				support_drift_max = maxf(support_drift_max, actual_support_foot.distance_to(last_support_foot))
				if support_samples >= 3 and actual_support_foot.distance_to(athlete.support_anchor_world) < 0.15:
					support_stable = true
				athlete.apply_pose(movement_state)
				var repeated_support_foot: Vector3 = athlete._bone_world_position(support_bone)
				if repeated_support_foot.distance_to(actual_support_foot) < 0.001:
					support_repeat_stable = true
			support_seen = true
		last_support_side = athlete.support_side
		last_support_anchor = athlete.support_anchor_world
		last_support_foot = athlete._bone_world_position("ball_l" if athlete.support_side == "left" else "ball_r")
	if not _check(support_stable, "support foot did not remain near its world anchor for several ticks"):
		return
	if not _check(support_repeat_stable, "reapplying an active support snapshot changed the foot pose"):
		return
	if not _check(support_drift_max < 0.08, "planted support foot drifted %.3fm between ticks" % support_drift_max):
		return
	if not _check(absf(last_support_anchor.y - 0.05) < 0.001, "support anchor was not fixed to the ground plane"):
		return
	var sprint_support_seen := false
	var sprint_support_stable := false
	var sprint_support_ticks := 0
	var sprint_last_side := ""
	var sprint_last_anchor := Vector3.ZERO
	main.simulation.reset_match()
	for _sprint_tick in range(150):
		movement_state = main.simulation.advance(1.0, 0.0, true, false, false)
		athlete.position = movement_state.player_position
		athlete.apply_pose(movement_state)
		if athlete.support_anchor_active:
			sprint_support_ticks += 1
			if sprint_support_seen and athlete.support_side == sprint_last_side and athlete.support_anchor_world.distance_to(sprint_last_anchor) < 0.001:
				sprint_support_stable = true
			sprint_support_seen = true
			sprint_last_side = athlete.support_side
			sprint_last_anchor = athlete.support_anchor_world
	if not _check(sprint_support_stable, "sprint support anchor did not persist across ticks"):
		return
	var plants_before_reach: int = athlete.support_replant_count
	var displaced := movement_state.duplicate(true)
	displaced.tick += 1
	displaced.player_position += Vector3(2.0, 0.0, 0.0)
	displaced.left_foot += Vector3(2.0, 0.0, 0.0)
	displaced.right_foot += Vector3(2.0, 0.0, 0.0)
	athlete.position = displaced.player_position
	athlete.apply_pose(displaced)
	if not _check(not athlete.support_anchor_active or athlete.support_replant_count > plants_before_reach, "support anchor did not release beyond visual leg reach"):
		return
	main.simulation.reset_match()
	var turn_state: Dictionary = {}
	for _turn_tick in range(60):
		turn_state = main.simulation.advance(1.0, 0.0, false, false, false)
		athlete.position = turn_state.player_position
		athlete.apply_pose(turn_state)
		if athlete.support_anchor_active:
			break
	var plants_before_turn: int = athlete.support_replant_count
	var reverse := turn_state.duplicate(true)
	reverse.tick += 1
	reverse.player_velocity = Vector3(-6.0, 0.0, 0.0)
	athlete.position = reverse.player_position
	athlete.apply_pose(reverse)
	if not _check(athlete.support_replant_count > plants_before_turn or not athlete.support_anchor_active, "support anchor did not release or replant after direction change"):
		return
	main.simulation.reset_match()
	var reset_state: Dictionary = main.simulation.snapshot()
	athlete.position = reset_state.player_position
	athlete.apply_pose(reset_state)
	if not _check(not athlete.support_anchor_active, "reset left a stale support anchor"):
		return
	main.simulation.reset_match()
	for _charge_tick in range(30):
		main.simulation.advance(0.0, 0.0, false, true, false)
	var strike: Dictionary = main.simulation.advance(0.0, 0.0, false, false, false)
	if not _check(bool(strike.get("striking", false)), "core did not expose a striking snapshot for foot verification"):
		return
	var contact_seen := false
	for _tick in range(30):
		strike = main.simulation.advance(0.0, 0.0, false, false, false)
		athlete.position = strike.player_position
		athlete.apply_pose(strike)
		if strike.ball_velocity.y > 1.0:
			contact_seen = true
			break
	if not _check(contact_seen, "fixture never reached ball impulse"):
		return
	for _frame in range(4):
		await physics_frame
	var foot: int = athlete.skeleton.find_bone("ball_r")
	var foot_world: Vector3 = athlete.skeleton.global_transform * athlete.skeleton.get_bone_global_pose(foot).origin
	var foot_error: float = foot_world.distance_to(strike.right_foot)
	var target_error: float = athlete.foot_targets["right"].global_position.distance_to(strike.right_foot)
	if not _check(target_error < 0.001, "right foot target was not forwarded from Rust"):
		return
	if not _check(foot_error <= 0.15, "kick toe missed Rust target by %.3fm" % foot_error):
		return
	var support: Vector3 = athlete.skeleton.to_global(athlete.skeleton.get_bone_global_pose(athlete.skeleton.find_bone("ball_l")).origin)
	if not _check(support.y > -0.05, "support foot is below ground"):
		return
	var head: int = athlete.skeleton.find_bone("Head")
	var hair_before: Vector3 = hair.global_position
	athlete.skeleton.set_bone_pose_rotation(head, Quaternion.from_euler(Vector3(0.0, 0.35, 0.0)))
	athlete.skeleton.force_update_all_bone_transforms()
	await process_frame
	var hair_after: Vector3 = hair.global_position
	if not _check(hair_after.distance_to(hair_before) > 0.001, "hair did not follow Head bone"):
		return
	print("athlete_visual.gd: PASS (support drift %.3fm over %d same-anchor samples, sprint support %d ticks, Rust target error %.3fm, ball_r error %.3fm, Skeleton3D and head hair attachment)" % [support_drift_max, support_samples, sprint_support_ticks, target_error, foot_error])
	quit(0)


func _check(condition: bool, message: String) -> bool:
	if condition:
		return true
	push_error("athlete_visual.gd: " + message)
	quit(1)
	return false
