extends Node3D

## Quaternius presentation rig for the native training client.
##
## The mesh, hair and eye resources are local CC0 runtime files copied from
## public/assets/athlete. Gameplay remains in CampoSimulation; this script
## only applies a small pose overlay and foot targets supplied by its snapshot.

var model: Node3D
var skeleton: Skeleton3D
@export var team_color := Color("#d9423d")
var bones: Dictionary = {}
var foot_targets: Dictionary = {}
var asset_ready := false
var pose_phase := 0.0
var body_shader: Shader
var eye_texture: Texture2D
var hair_texture: Texture2D
var motion_meta: Dictionary = {}
var motion_values := PackedFloat32Array()
var motion_indices: Array[int] = []
var motion_pose_positions: Array[Vector3] = []
var motion_pose_rotations: Array[Quaternion] = []
var transition_from_positions: Array[Vector3] = []
var transition_from_rotations: Array[Quaternion] = []
var previous_clip_name := ""
var clip_transition_time := 1.0
var locomotion_distance := 0.0
var idle_clock := 0.0
var last_pose_tick := -1
var kick_foot_error := INF
var active_clip_name := ""
var support_anchor_world := Vector3.ZERO
var support_anchor_active := false
var support_side := ""
var support_last_direction := Vector3.ZERO
var support_replant_count := 0
const SUPPORT_GROUND_Y := 0.05
const SUPPORT_GROUND_TOLERANCE := 0.18
const CHARGE_KICK_POSE_SPEED := 0.85


func _ready() -> void:
	var packed := load("res://assets/athlete/athlete.gltf") as PackedScene
	if packed == null:
		push_error("CAMPO: Quaternius athlete.gltf could not be loaded")
		return
	model = packed.instantiate()
	model.name = "QuaterniusAthlete"
	# Quaternius' authored forward is +Z; the native camera/bridge convention
	# uses -Z, so keep the imported rig facing the same direction as the ball
	# and the facing vector supplied by CampoSimulation.
	model.rotation.y = PI
	add_child(model)
	skeleton = _find_skeleton(model)
	if skeleton == null:
		push_error("CAMPO: imported athlete has no Skeleton3D")
		return
	_cache_bones()
	_load_textures()
	_load_motion()
	_configure_materials(model)
	_attach_hair()
	_create_foot_targets()
	model.scale = Vector3(1.35, 1.35, 1.35)
	# Preserve the authored ground plane; lowering the root buries the support foot.
	model.position.y = 0.0
	asset_ready = true


func apply_pose(state: Dictionary) -> void:
	if not asset_ready or skeleton == null:
		return
	_clear_leg_overrides()
	kick_foot_error = INF
	var velocity: Vector3 = state.get("player_velocity", Vector3.ZERO)
	var speed := Vector2(velocity.x, velocity.z).length()
	var tick := int(state.get("tick", 0))
	var charge: float = float(state.get("charge", 0.0))
	var striking := bool(state.get("striking", false))
	var shot_phase: float = float(state.get("shot_phase", 0.0))
	var moving := speed > 0.12
	var stride := clampf(speed / 9.775, 0.0, 1.0)
	var left_foot: Vector3 = state.get("left_foot", global_position + Vector3(-0.12, 0.05, 0.0))
	var right_foot: Vector3 = state.get("right_foot", global_position + Vector3(0.12, 0.05, 0.0))
	# Shift visual weight toward the ball without moving the authoritative body.
	var weight_shift := to_local(right_foot)
	weight_shift.y = 0.0
	model.position = weight_shift.normalized() * 0.28 * smoothstep(0.0, 0.35, shot_phase) if charge > 0.0 or striking else Vector3.ZERO
	var dt := _advance_pose_clock(tick, speed)
	_apply_motion_clip(speed, charge, striking, shot_phase, dt)
	_set_target("left", left_foot)
	_set_target("right", right_foot)
	var lean := clampf(speed * 0.014, 0.0, 0.12)
	if charge > 0.0 or striking:
		lean += 0.09 + charge * 0.08
	_pose_bone("pelvis", Vector3(0.0, 0.0, lean * 0.24))
	_pose_bone("spine_02", Vector3(-lean * 0.55, 0.0, 0.0))
	_pose_bone("spine_03", Vector3(-lean * 0.35, 0.0, 0.0))

	var left_swing := sin(pose_phase) * 0.18 * stride
	var right_swing := -left_swing
	if not moving:
		left_swing = sin(pose_phase * 0.45) * 0.02
		right_swing = -left_swing
	_pose_bone("thigh_l", Vector3(left_swing, 0.0, 0.0))
	_pose_bone("thigh_r", Vector3(right_swing, 0.0, 0.0))
	_pose_bone("calf_l", Vector3(-maxf(0.0, left_swing) * 0.5, 0.0, 0.0))
	_pose_bone("calf_r", Vector3(-maxf(0.0, right_swing) * 0.5, 0.0, 0.0))
	_pose_bone("upperarm_l", Vector3(-left_swing * 0.7, 0.0, 0.0))
	_pose_bone("upperarm_r", Vector3(-right_swing * 0.7, 0.0, 0.0))

	if charge > 0.0 or striking:
		var windup := clampf(charge * 0.9 + (1.0 - shot_phase) * 0.25, 0.0, 1.0)
		_pose_bone("thigh_r", Vector3(right_swing - windup * 0.52, 0.0, 0.0))
		_pose_bone("calf_r", Vector3(-right_swing * 0.4 - windup * 0.42, 0.0, 0.0))
		_pose_bone("spine_02", Vector3(-lean * 0.7, -windup * 0.08, 0.0))
	_update_support_anchor(velocity, speed, charge, striking)
	if striking:
		_solve_kick_foot(right_foot)


func _find_skeleton(node: Node) -> Skeleton3D:
	if node is Skeleton3D:
		return node as Skeleton3D
	for child in node.get_children():
		var found := _find_skeleton(child)
		if found:
			return found
	return null


func _cache_bones() -> void:
	for name in ["root", "pelvis", "spine_02", "spine_03", "thigh_l", "calf_l", "foot_l", "ball_l", "thigh_r", "calf_r", "foot_r", "ball_r", "upperarm_l", "upperarm_r", "Head"]:
		var index := skeleton.find_bone(name)
		if index >= 0:
			bones[name] = index


func _load_textures() -> void:
	eye_texture = load("res://assets/athlete/T_Eye_Brown.png") as Texture2D
	hair_texture = load("res://assets/athlete/T_Hair_1_BaseColor.png") as Texture2D


func _load_motion() -> void:
	var motion_file := FileAccess.open("res://assets/athlete/motion.json", FileAccess.READ)
	var pose_file := FileAccess.open("res://assets/athlete/poses.bin", FileAccess.READ)
	if motion_file == null or pose_file == null:
		return
	var parsed = JSON.parse_string(motion_file.get_as_text())
	if not parsed is Dictionary or not parsed.has("bones"):
		return
	motion_meta = parsed
	motion_values = pose_file.get_buffer(pose_file.get_length()).to_float32_array()
	for name in motion_meta.bones:
		motion_indices.append(skeleton.find_bone(name))


func _advance_pose_clock(tick: int, speed: float) -> float:
	if last_pose_tick >= 0 and tick < last_pose_tick:
		locomotion_distance = 0.0
		idle_clock = 0.0
		previous_clip_name = ""
		motion_pose_positions.clear()
		motion_pose_rotations.clear()
		transition_from_positions.clear()
		transition_from_rotations.clear()
		clip_transition_time = 1.0
		support_anchor_active = false
		support_side = ""
		support_last_direction = Vector3.ZERO
	if last_pose_tick < 0 or tick < last_pose_tick:
		last_pose_tick = tick
		return 0.0
	var tick_delta := clampi(tick - last_pose_tick, 0, 30)
	last_pose_tick = tick
	var dt := float(tick_delta) / 120.0
	locomotion_distance += speed * dt
	idle_clock += dt
	return dt


func _find_motion_clip(name: String) -> Dictionary:
	for candidate in motion_meta.get("clips", []):
		if candidate.get("name") == name:
			return candidate
	return {}


func _locomotion_frame(clip: Dictionary, speed: float) -> float:
	var count := int(clip.get("count", 1))
	if count <= 1:
		return 0.0
	var distances: Array = clip.get("distance", [])
	if distances.size() < count or float(distances[count - 1]) <= 0.0001:
		return fmod(idle_clock * float(clip.get("fps", 30.0)), float(count))
	var cycle_distance := float(distances[count - 1])
	var distance := fmod(locomotion_distance, cycle_distance)
	for index in range(count - 1):
		var a := float(distances[index])
		var b := float(distances[index + 1])
		if distance <= b:
			var span := maxf(b - a, 0.0001)
			return float(index) + clampf((distance - a) / span, 0.0, 1.0)
	return float(count - 1)


func _apply_motion_clip(speed: float, charge: float, striking: bool, shot_phase: float, dt: float) -> void:
	if motion_meta.is_empty() or motion_values.is_empty() or motion_indices.is_empty():
		return
	var clip_name := "idle"
	# While a moving player charges, retain the authored locomotion cycle until
	# Rust has braked the body; the kick preparation overlay then blends in
	# without freezing a running frame under a planted foot.
	if striking or (charge > 0.0 and speed <= CHARGE_KICK_POSE_SPEED):
		clip_name = "kick"
	elif speed >= 7.4:
		clip_name = "sprint"
	elif speed >= 4.2:
		clip_name = "jog"
	elif speed > 0.12:
		clip_name = "walk"
	active_clip_name = clip_name
	var clip: Dictionary = _find_motion_clip(clip_name)
	if clip.is_empty():
		return
	var count := int(clip.get("count", 1))
	var frame: float = _locomotion_frame(clip, speed)
	if clip_name == "kick":
		frame = clampf(clampf(shot_phase, 0.0, 1.0) * float(count - 1), 0.0, float(count - 1))
	var frame_a := clampi(int(floor(frame)), 0, count - 1)
	var frame_b := mini(frame_a + 1, count - 1)
	var frame_mix := frame - float(frame_a)
	var clip_start := int(clip.get("start", 0))
	var pose_count := motion_indices.size()
	var target_positions: Array[Vector3] = []
	var target_rotations: Array[Quaternion] = []
	for i in range(motion_indices.size()):
		var bone_index := motion_indices[i]
		var offset_a := (clip_start + frame_a) * pose_count * 7 + i * 7
		var offset_b := (clip_start + frame_b) * pose_count * 7 + i * 7
		var position_a := Vector3(motion_values[offset_a], motion_values[offset_a + 1], motion_values[offset_a + 2])
		var position_b := Vector3(motion_values[offset_b], motion_values[offset_b + 1], motion_values[offset_b + 2])
		var rotation_a := Quaternion(motion_values[offset_a + 3], motion_values[offset_a + 4], motion_values[offset_a + 5], motion_values[offset_a + 6])
		var rotation_b := Quaternion(motion_values[offset_b + 3], motion_values[offset_b + 4], motion_values[offset_b + 5], motion_values[offset_b + 6])
		target_positions.append(position_a.lerp(position_b, frame_mix))
		target_rotations.append(rotation_a.slerp(rotation_b, frame_mix))
	if previous_clip_name != clip_name:
		clip_transition_time = 0.0
		transition_from_positions = motion_pose_positions.duplicate()
		transition_from_rotations = motion_pose_rotations.duplicate()
		previous_clip_name = clip_name
	else:
		clip_transition_time += dt
	var blend := 1.0 if transition_from_rotations.size() != target_rotations.size() else smoothstep(0.0, 0.12, clip_transition_time)
	var blended_positions: Array[Vector3] = []
	var blended_rotations: Array[Quaternion] = []
	for i in range(pose_count):
		var bone_index := motion_indices[i]
		var position := target_positions[i]
		var rotation := target_rotations[i]
		if blend < 1.0:
			position = transition_from_positions[i].lerp(position, blend)
			rotation = transition_from_rotations[i].slerp(rotation, blend)
		blended_positions.append(position)
		blended_rotations.append(rotation)
		if bone_index < 0:
			continue
		skeleton.set_bone_pose_position(bone_index, position)
		skeleton.set_bone_pose_rotation(bone_index, rotation)
	motion_pose_positions = blended_positions
	motion_pose_rotations = blended_rotations
	pose_phase = frame / maxf(float(count), 1.0) * TAU


func _configure_materials(node: Node) -> void:
	if node is MeshInstance3D:
		var mesh_node := node as MeshInstance3D
		var node_name := mesh_node.name.to_lower()
		if node_name.contains("eye"):
			var eyes := StandardMaterial3D.new()
			eyes.albedo_color = Color.WHITE
			eyes.albedo_texture = eye_texture
			eyes.roughness = 0.42
			mesh_node.material_override = eyes
		elif node_name.contains("brow") or node_name.contains("hair"):
			var hair := StandardMaterial3D.new()
			hair.albedo_color = Color("#30241c")
			hair.albedo_texture = hair_texture
			hair.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA_SCISSOR
			hair.alpha_scissor_threshold = 0.45
			hair.cull_mode = BaseMaterial3D.CULL_DISABLED
			hair.roughness = 0.9
			mesh_node.material_override = hair
		else:
			mesh_node.material_override = body_shader_material()
	for child in node.get_children():
		_configure_materials(child)


func body_shader_material() -> ShaderMaterial:
	if body_shader == null:
		body_shader = Shader.new()
		body_shader.code = """
shader_type spatial;
render_mode diffuse_burley, cull_back;
varying vec3 kit_position;
uniform vec4 skin_color : source_color = vec4(0.72, 0.45, 0.32, 1.0);
uniform vec4 shirt_color : source_color = vec4(0.86, 0.16, 0.12, 1.0);
uniform vec4 shorts_color : source_color = vec4(0.04, 0.11, 0.16, 1.0);
uniform vec4 boot_color : source_color = vec4(0.83, 0.86, 0.42, 1.0);
void vertex() { kit_position = VERTEX; }
void fragment() {
    vec3 kit = skin_color.rgb;
    if (kit_position.y > 0.92 && kit_position.y < 1.59 && abs(kit_position.x) < 0.49) {
        kit = shirt_color.rgb;
    } else if (kit_position.y > 0.62 && kit_position.y <= 0.94 && abs(kit_position.x) < 0.28) {
        kit = shorts_color.rgb;
    } else if (kit_position.y <= 0.12) {
        kit = boot_color.rgb;
    }
    ALBEDO = kit;
    ROUGHNESS = 0.84;
}
"""
	var material := ShaderMaterial.new()
	material.shader = body_shader
	material.set_shader_parameter("shirt_color", team_color)
	material.set_shader_parameter("shorts_color", Color("#102b43"))
	material.set_shader_parameter("skin_color", Color("#b87d53"))
	material.set_shader_parameter("boot_color", Color("#e5d35c"))
	return material


func _attach_hair() -> void:
	if skeleton == null or skeleton.find_bone("Head") < 0:
		return
	var packed := load("res://assets/athlete/Hair_Buzzed.gltf") as PackedScene
	if packed == null:
		return
	var hair := packed.instantiate()
	hair.name = "QuaterniusHair"
	# Hair_Buzzed is authored in the body's bind/world coordinates. Preserve
	# that transform while reparenting to a BoneAttachment3D, matching the
	# legacy Head.attach(hair) behavior without applying the head offset twice.
	model.add_child(hair)
	var bind_transform: Transform3D = hair.global_transform
	var attachment := BoneAttachment3D.new()
	attachment.name = "HeadHairAttachment"
	attachment.bone_name = "Head"
	skeleton.add_child(attachment)
	hair.reparent(attachment, true)
	# Keep this explicit because imported Skeleton3D transforms are updated on
	# the following frame on some Godot renderer paths.
	hair.global_transform = bind_transform
	_configure_materials(hair)


func _create_foot_targets() -> void:
	for side in ["left", "right"]:
		var target := Node3D.new()
		target.name = side.capitalize() + "FootTarget"
		add_child(target)
		foot_targets[side] = target


func _support_side_for_phase() -> String:
	if active_clip_name not in ["walk", "jog", "sprint"]:
		return ""
	var phase := fmod(pose_phase / TAU, 1.0)
	return "left" if phase < 0.5 else "right"


func _bone_world_position(name: String) -> Vector3:
	var index := int(bones.get(name, -1))
	if index < 0:
		return global_position
	return skeleton.to_global(skeleton.get_bone_global_pose(index).origin)


func _clear_support_anchor() -> void:
	support_anchor_active = false
	support_side = ""


func _foot_is_near_ground(world_foot: Vector3) -> bool:
	return absf(world_foot.y - SUPPORT_GROUND_Y) <= SUPPORT_GROUND_TOLERANCE


func _grounded_anchor(world_foot: Vector3) -> Vector3:
	var anchor := world_foot
	anchor.y = SUPPORT_GROUND_Y
	return anchor


func _update_support_anchor(velocity: Vector3, speed: float, charge: float, striking: bool) -> void:
	if striking or charge > 0.0 or speed <= 0.12:
		_clear_support_anchor()
		support_last_direction = Vector3.ZERO if speed <= 0.12 else velocity.normalized()
		return
	var direction := Vector3(velocity.x, 0.0, velocity.z).normalized()
	var direction_changed := support_last_direction.length_squared() > 0.001 and direction.dot(support_last_direction) < 0.35
	support_last_direction = direction
	var desired_side := _support_side_for_phase()
	if desired_side.is_empty():
		_clear_support_anchor()
		return
	var needs_replant := not support_anchor_active or support_side != desired_side or direction_changed
	var current_foot := _bone_world_position("ball_" + ("l" if desired_side == "left" else "r"))
	if needs_replant:
		if not _foot_is_near_ground(current_foot):
			_clear_support_anchor()
			return
		support_anchor_world = _grounded_anchor(current_foot)
		support_anchor_active = true
		support_side = desired_side
		support_replant_count += 1
	var error := _solve_two_bone_foot("l" if support_side == "left" else "r", support_anchor_world)
	if error > 0.18:
		# The old plant is beyond the visual leg's current reach; release it and
		# plant at the sampled foot instead of stretching or moving the ball.
		var replacement_foot := _bone_world_position("ball_" + ("l" if support_side == "left" else "r"))
		if _foot_is_near_ground(replacement_foot):
			support_anchor_world = _grounded_anchor(replacement_foot)
			support_replant_count += 1
			_solve_two_bone_foot("l" if support_side == "left" else "r", support_anchor_world)
		else:
			_clear_support_anchor()


func _clear_leg_overrides() -> void:
	if skeleton.has_method("clear_bones_global_pose_override"):
		skeleton.call("clear_bones_global_pose_override")


func _rotation_between(from_direction: Vector3, to_direction: Vector3) -> Quaternion:
	if from_direction.length_squared() < 0.000001 or to_direction.length_squared() < 0.000001:
		return Quaternion.IDENTITY
	var from := from_direction.normalized()
	var to := to_direction.normalized()
	var dot := clampf(from.dot(to), -1.0, 1.0)
	var axis := from.cross(to)
	if axis.length_squared() > 0.000001:
		return Quaternion(axis.normalized(), acos(dot))
	if dot < 0.0:
		var fallback_axis := from.cross(Vector3.UP)
		if fallback_axis.length_squared() < 0.000001:
			fallback_axis = from.cross(Vector3.RIGHT)
		return Quaternion(fallback_axis.normalized(), PI)
	return Quaternion.IDENTITY


func _solve_kick_foot(world_target: Vector3) -> void:
	kick_foot_error = _solve_two_bone_foot("r", world_target)


func _solve_two_bone_foot(side: String, world_target: Vector3) -> float:
	# This is presentation-only two-bone IK: Rust still owns the real swept foot and
	# ball contact. The imported rig is solved in Skeleton3D space so the
	# world-space target does not depend on camera or model rotation.
	var thigh_index := int(bones.get("thigh_" + side, -1))
	var calf_index := int(bones.get("calf_" + side, -1))
	var ball_index := int(bones.get("ball_" + side, -1))
	if thigh_index < 0 or calf_index < 0 or ball_index < 0:
		return INF
	_clear_leg_overrides()
	skeleton.force_update_all_bone_transforms()
	var target := skeleton.to_local(world_target)
	var hip := skeleton.get_bone_global_pose(thigh_index).origin
	var knee := skeleton.get_bone_global_pose(calf_index).origin
	var ankle := skeleton.get_bone_global_pose(ball_index).origin
	var upper_length := hip.distance_to(knee)
	var lower_length := knee.distance_to(ankle)
	var reach := maxf(upper_length + lower_length - 0.015, 0.02)
	var offset := target - hip
	if offset.length() > reach:
		target = hip + offset.normalized() * reach
	var minimum := absf(upper_length - lower_length) + 0.01
	if offset.length() < minimum:
		target = hip + offset.normalized() * minimum
	var forward := (target - hip).normalized()
	var distance := hip.distance_to(target)
	var along := (upper_length * upper_length - lower_length * lower_length + distance * distance) / maxf(2.0 * distance, 0.0001)
	var bend_height := sqrt(maxf(upper_length * upper_length - along * along, 0.0))
	var pole := knee - hip - forward * (knee - hip).dot(forward)
	if pole.length_squared() < 0.000001:
		pole = Vector3.UP - forward * forward.dot(Vector3.UP)
	pole = pole.normalized()
	var solved_knee := hip + forward * along + pole * bend_height
	var thigh_pose: Transform3D = skeleton.get_bone_global_pose(thigh_index)
	var calf_pose: Transform3D = skeleton.get_bone_global_pose(calf_index)
	var thigh_delta := _rotation_between(knee - hip, solved_knee - hip)
	var calf_delta := _rotation_between(ankle - knee, target - solved_knee)
	skeleton.set_bone_global_pose_override(thigh_index, Transform3D(Basis(thigh_delta) * thigh_pose.basis.orthonormalized(), hip), 1.0, true)
	skeleton.set_bone_global_pose_override(calf_index, Transform3D(Basis(calf_delta) * calf_pose.basis.orthonormalized(), solved_knee), 1.0, true)
	skeleton.force_update_all_bone_transforms()
	var solved := skeleton.get_bone_global_pose(ball_index).origin
	return skeleton.to_global(solved).distance_to(world_target)


func _set_target(side: String, world_target: Vector3) -> void:
	if foot_targets.has(side):
		foot_targets[side].global_position = world_target


func _pose_bone(name: String, euler: Vector3) -> void:
	if not bones.has(name):
		return
	var current: Quaternion = skeleton.get_bone_pose_rotation(bones[name])
	skeleton.set_bone_pose_rotation(bones[name], current * Quaternion.from_euler(euler))
