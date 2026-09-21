extends Node3D

## Presentation-only Godot client for the Rust-owned training simulation.
## The script never recreates gameplay state: every authoritative value comes
## from CampoSimulation through the GDExtension boundary.

const FIELD_SIZE := Vector2(92.0, 60.0)
const GOAL_WIDTH := 7.32
const GOAL_HEIGHT := 2.44
const Athlete = preload("res://scripts/athlete.gd")

@onready var camera: Camera3D = $Camera

var simulation: Object
var current_state: Dictionary = {}
var player_visual: Athlete
var teammate_visual: Athlete
var defender_visual: Athlete
var ball_visual: Node3D
var close_camera := true
var hud: CanvasLayer
var hud_state: Label
var hud_help: Label
var pause_panel: ColorRect
var error_panel: ColorRect
var error_label: Label
var field_target := Vector3(-19.5, 0.0, 0.0)
var camera_target := field_target
var tick_count := 0
var shoot_suppressed := false
var pass_suppressed := false
var cancel_pending := false
var smoke_mode := false
var smoke_tick := 0
var smoke_capture_path := ""
var smoke_initial_player := Vector3.ZERO
var smoke_initial_ball := Vector3.ZERO
var smoke_ball_kick_seen := false
var smoke_finished := false
var strike_capture_started := false
var strike_capture_saved := false
var bridge_ready := false

var grass_light: StandardMaterial3D
var grass_dark: StandardMaterial3D
var line_material: StandardMaterial3D
var goal_material: StandardMaterial3D
var white_material: StandardMaterial3D
var black_material: StandardMaterial3D


func _ready() -> void:
	# Loading the extension resource is intentional. If the Rust binary is
	# missing, the client presents an actionable error instead of simulating in
	# GDScript with a second set of rules.
	load("res://campo.gdextension")
	bridge_ready = ClassDB.class_exists("CampoSimulation")
	_build_arena()
	_build_hud()
	_parse_command_line()
	if bridge_ready:
		simulation = ClassDB.instantiate("CampoSimulation")
		bridge_ready = simulation != null
	if bridge_ready and not simulation.has_method("advance_actions") and not smoke_mode:
		_show_error("A ponte nativa está desatualizada para o treino 2v1.\n\nCompile a extensão Rust v0.3 e substitua native/client/bin/libcampo_godot.dylib.")
	if bridge_ready:
		current_state = simulation.snapshot()
		_apply_state(current_state)
		smoke_initial_player = _state_vector("player_position", Vector3.ZERO)
		smoke_initial_ball = _state_vector("ball_position", Vector3.ZERO)
	else:
		_show_error("A ponte nativa CampoSimulation não foi encontrada.\n\nCompile o GDExtension Rust e coloque campo.gdextension em native/client/.")
	if smoke_mode and not bridge_ready:
		_finish_smoke(2)


func _physics_process(_delta: float) -> void:
	if get_tree().paused or not bridge_ready or (not simulation.has_method("advance_actions") and not smoke_mode):
		return
	var movement := _read_movement()
	var sprint := _read_sprint()
	var shoot := _read_shoot()
	var pass_action := _read_pass()
	var tackle := _read_tackle()
	if smoke_mode:
		movement = Vector2.ZERO if smoke_tick < 60 else Vector2(0.65, 0.0)
		sprint = smoke_tick >= 60
		shoot = smoke_tick < 60
		pass_action = false
		tackle = false
	var cancel := cancel_pending
	cancel_pending = false
	if simulation.has_method("advance_actions"):
		current_state = simulation.call("advance_actions", movement.x, movement.y, sprint, shoot, cancel, pass_action, tackle)
	else:
		# Smoke keeps a narrow compatibility path for the v0.2 physics fixture.
		current_state = simulation.advance(movement.x, movement.y, sprint, shoot, cancel)
	tick_count += 1
	if smoke_mode:
		smoke_tick += 1
	_apply_state(current_state)
	if smoke_mode and smoke_tick >= 240:
		_finish_smoke(0)


func _process(delta: float) -> void:
	_update_camera(delta)
	_update_actor_animation(delta)
	if hud_state and bridge_ready:
		_update_hud()


func _notification(what: int) -> void:
	if what == NOTIFICATION_APPLICATION_FOCUS_OUT and not smoke_mode:
		_cancel_action_without_advancing()
		if bridge_ready and not get_tree().paused and not smoke_mode:
			get_tree().paused = true
			if pause_panel:
				pause_panel.visible = true


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and not event.echo:
		if event.keycode == KEY_ESCAPE:
			_toggle_pause()
		elif event.keycode == KEY_C:
			close_camera = not close_camera
		elif event.keycode == KEY_R:
			_reset_match()
	if event is InputEventJoypadButton and event.pressed:
		if event.button_index == JOY_BUTTON_START:
			_toggle_pause()
		elif event.button_index == JOY_BUTTON_BACK:
			_reset_match()


func _read_movement() -> Vector2:
	var movement := Vector2.ZERO
	if Input.is_key_pressed(KEY_A) or Input.is_key_pressed(KEY_LEFT):
		movement.x -= 1.0
	if Input.is_key_pressed(KEY_D) or Input.is_key_pressed(KEY_RIGHT):
		movement.x += 1.0
	if Input.is_key_pressed(KEY_W) or Input.is_key_pressed(KEY_UP):
		movement.y -= 1.0
	if Input.is_key_pressed(KEY_S) or Input.is_key_pressed(KEY_DOWN):
		movement.y += 1.0
	var pads := Input.get_connected_joypads()
	if not pads.is_empty():
		var pad := pads[0]
		var stick := Vector2(Input.get_joy_axis(pad, JOY_AXIS_LEFT_X), Input.get_joy_axis(pad, JOY_AXIS_LEFT_Y))
		if stick.length() > 0.15:
			movement = stick.limit_length(1.0)
	return movement.limit_length(1.0)


func _read_sprint() -> bool:
	if Input.is_key_pressed(KEY_SHIFT):
		return true
	for pad in Input.get_connected_joypads():
		if Input.get_joy_axis(pad, JOY_AXIS_TRIGGER_RIGHT) > 0.2:
			return true
		if Input.is_joy_button_pressed(pad, JOY_BUTTON_RIGHT_SHOULDER):
			return true
	return false


func _read_shoot() -> bool:
	var held := Input.is_key_pressed(KEY_SPACE)
	for pad in Input.get_connected_joypads():
		held = held or Input.is_joy_button_pressed(pad, JOY_BUTTON_X)
	if shoot_suppressed:
		if not held:
			shoot_suppressed = false
		return false
	return held


func _read_pass() -> bool:
	var held := Input.is_key_pressed(KEY_J)
	for pad in Input.get_connected_joypads():
		held = held or Input.is_joy_button_pressed(pad, JOY_BUTTON_A)
	if pass_suppressed:
		if not held:
			pass_suppressed = false
		return false
	return held


func _read_tackle() -> bool:
	var held := Input.is_key_pressed(KEY_K)
	for pad in Input.get_connected_joypads():
		held = held or Input.is_joy_button_pressed(pad, JOY_BUTTON_B)
	return held


func _toggle_pause() -> void:
	if not bridge_ready:
		return
	if get_tree().paused:
		get_tree().paused = false
		pause_panel.visible = false
	else:
		_cancel_action_without_advancing()
		get_tree().paused = true
		pause_panel.visible = true


func _reset_match() -> void:
	if not bridge_ready:
		return
	_cancel_action_without_advancing()
	simulation.reset_match()
	current_state = simulation.snapshot()
	_apply_state(current_state)
	if get_tree().paused:
		get_tree().paused = false
		pause_panel.visible = false


func _cancel_action_without_advancing() -> void:
	shoot_suppressed = true
	pass_suppressed = true
	cancel_pending = false
	if bridge_ready and simulation.has_method("cancel_action"):
		simulation.call("cancel_action")


func _apply_state(next_state: Dictionary) -> void:
	if next_state.is_empty():
		return
	current_state = next_state
	var player_position := _state_vector("player_position", Vector3.ZERO)
	var ball_position := _state_vector("ball_position", Vector3(0.0, 0.11, 0.0))
	_apply_actor_state(player_visual, next_state)
	var teammate_state: Dictionary = next_state.get("teammate", {})
	var defender_state: Dictionary = next_state.get("defender", {})
	_apply_actor_state(teammate_visual, teammate_state)
	_apply_actor_state(defender_visual, defender_state)
	if teammate_visual:
		teammate_visual.visible = not teammate_state.is_empty()
	if defender_visual:
		defender_visual.visible = not defender_state.is_empty()
	if ball_visual:
		ball_visual.position = ball_position
	if smoke_mode:
		var ball_velocity := _state_vector("ball_velocity", Vector3.ZERO)
		if bool(current_state.get("striking", false)) and ball_velocity.y > 1.0 and Vector2(ball_velocity.x, ball_velocity.z).length() > 5.0:
			smoke_ball_kick_seen = true
	field_target = player_position.lerp(ball_position, 0.38)
	if not teammate_state.is_empty() and not defender_state.is_empty():
		var teammate_position: Vector3 = teammate_state.get("player_position", player_position)
		var defender_position: Vector3 = defender_state.get("player_position", player_position)
		var actors_center := (player_position + teammate_position + defender_position) / 3.0
		field_target = field_target.lerp(actors_center, 0.28)
	_update_actor_animation(0.0)
	if smoke_mode and not strike_capture_started and bool(current_state.get("striking", false)) and float(current_state.get("shot_phase", 0.0)) > 0.65 and not smoke_capture_path.is_empty():
		strike_capture_started = true
		_capture_strike()
	_update_hud()


func _apply_actor_state(actor: Node3D, actor_state: Dictionary) -> void:
	if actor == null or actor_state.is_empty():
		return
	var actor_position: Vector3 = actor_state.get("player_position", actor.position)
	actor.position = actor_position
	var facing: Vector3 = actor_state.get("facing", Vector3.RIGHT)
	if facing.length_squared() > 0.001:
		actor.rotation.y = atan2(-facing.x, -facing.z)


func _capture_strike() -> void:
	await RenderingServer.frame_post_draw
	var image := get_viewport().get_texture().get_image()
	if image:
		strike_capture_saved = image.save_png(smoke_capture_path.get_basename() + "-strike.png") == OK


func _state_vector(key: String, fallback: Vector3) -> Vector3:
	var value = current_state.get(key, fallback)
	return value if value is Vector3 else fallback


func _update_hud() -> void:
	if not hud_state:
		return
	var velocity := _state_vector("player_velocity", Vector3.ZERO)
	var charge: float = float(current_state.get("charge", 0.0))
	var goals: int = int(current_state.get("goals", 0))
	var passes: int = int(current_state.get("passes_completed", 0))
	var tackles: int = int(current_state.get("tackles_won", 0))
	var possession: int = int(current_state.get("possession", -1))
	var speed := Vector2(velocity.x, velocity.z).length()
	var filled := int(round(charge * 16.0))
	var charge_bar := "=".repeat(filled) + "·".repeat(16 - filled)
	var possession_label: String = ["LIVRE", "VOCÊ", "COMPANHEIRO", "DEFENSOR"][clampi(possession + 1, 0, 3)]
	hud_state.text = "VELOCIDADE  %04.1f m/s    CARGA  [%s]    GOLS %02d    PASSES %02d    DESARMES %02d    POSSE %s" % [speed, charge_bar, goals, passes, tackles, possession_label]


func _update_camera(delta: float) -> void:
	if not camera:
		return
	var target: Vector3 = field_target
	camera_target = camera_target.lerp(target, 1.0 - exp(-delta * 5.0))
	if close_camera:
		camera_target.x = clampf(camera_target.x, -38.0, 38.0)
	else:
		# The wide broadcast keeps the positive-X goal in frame while the
		# player practices from the left half of the pitch.
		camera_target.x = clampf(max(camera_target.x, 12.0), 12.0, 25.0)
	camera_target.z = clampf(camera_target.z, -24.0, 24.0)
	camera.position = camera_target + (Vector3(0.0, 8.0, 11.0) if close_camera else Vector3(0.0, 31.0, 32.0))
	camera.look_at(camera_target, Vector3.UP)
	var player_position := _state_vector("player_position", Vector3.ZERO)
	var ball_position := _state_vector("ball_position", Vector3.ZERO)
	var separation: float = player_position.distance_to(ball_position)
	var actor_span := separation
	var teammate_state: Dictionary = current_state.get("teammate", {})
	var defender_state: Dictionary = current_state.get("defender", {})
	if not teammate_state.is_empty() and not defender_state.is_empty():
		var teammate_position: Vector3 = teammate_state.get("player_position", player_position)
		var defender_position: Vector3 = defender_state.get("player_position", player_position)
		actor_span = maxf(actor_span, player_position.distance_to(teammate_position))
		actor_span = maxf(actor_span, player_position.distance_to(defender_position))
		actor_span = maxf(actor_span, teammate_position.distance_to(defender_position))
	camera.size = clampf(maxf(12.0, actor_span * 1.15), 12.0, 34.0) if close_camera else 48.0


func _update_actor_animation(_delta: float) -> void:
	if player_visual:
		player_visual.apply_pose(current_state)
	var teammate_state: Dictionary = current_state.get("teammate", {})
	var defender_state: Dictionary = current_state.get("defender", {})
	if teammate_visual and not teammate_state.is_empty():
		teammate_visual.apply_pose(teammate_state)
	if defender_visual and not defender_state.is_empty():
		defender_visual.apply_pose(defender_state)


func _build_arena() -> void:
	grass_light = _make_material(Color("#173f28"), 0.94)
	grass_dark = _make_material(Color("#102f20"), 0.94)
	line_material = _make_material(Color("#e9fff0"), 0.72)
	line_material.cull_mode = BaseMaterial3D.CULL_DISABLED
	line_material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	goal_material = _make_material(Color("#dce9f5"), 0.38, Color("#b9dcff"))
	white_material = _make_material(Color("#f6f8ff"), 0.45)
	black_material = _make_material(Color("#131a27"), 0.7)
	_box(Vector3(112.0, 0.35, 78.0), Color("#081326"), Vector3(0.0, -0.34, 0.0))
	for index in range(8):
		var stripe := MeshInstance3D.new()
		var plane := PlaneMesh.new()
		plane.size = Vector2(FIELD_SIZE.x, 7.5)
		stripe.mesh = plane
		stripe.material_override = grass_light if index % 2 == 0 else grass_dark
		stripe.position = Vector3(0.0, -0.01, -26.25 + index * 7.5)
		add_child(stripe)
	_make_pitch_lines()
	_make_goals(-1.0)
	_make_goals(1.0)
	_make_stands()
	_make_players()
	_make_ball()
	_make_environment()


func _make_pitch_lines() -> void:
	var vertices := PackedVector3Array()
	var indices := PackedInt32Array()
	_add_line_rect(vertices, indices, Rect2(-46.0, -30.0, 92.0, 60.0), 0.16, 0.035)
	_add_line_rect(vertices, indices, Rect2(-46.0, -20.16, 16.5, 40.32), 0.14, 0.04)
	_add_line_rect(vertices, indices, Rect2(29.5, -20.16, 16.5, 40.32), 0.14, 0.04)
	_add_line_rect(vertices, indices, Rect2(-46.0, -9.16, 5.5, 18.32), 0.14, 0.04)
	_add_line_rect(vertices, indices, Rect2(40.5, -9.16, 5.5, 18.32), 0.14, 0.04)
	_add_quad(vertices, indices, Vector3(-0.09, 0.04, -30.0), Vector3(0.09, 0.04, -30.0), Vector3(0.09, 0.04, 30.0), Vector3(-0.09, 0.04, 30.0))
	var circle_segments := 64
	for i in range(circle_segments):
		var a0 := TAU * float(i) / circle_segments
		var a1 := TAU * float(i + 1) / circle_segments
		var p0 := Vector3(cos(a0) * 9.15, 0.04, sin(a0) * 9.15)
		var p1 := Vector3(cos(a1) * 9.15, 0.04, sin(a1) * 9.15)
		_add_segment(vertices, indices, p0, p1, 0.13)
	_mesh_from_arrays(vertices, indices, line_material)
	_box(Vector3(0.32, 0.04, 0.32), line_material.albedo_color, Vector3.ZERO + Vector3.UP * 0.06)


func _make_goals(side: float) -> void:
	var x: float = float(side) * 46.0
	var depth: float = float(side) * 3.6
	_box(Vector3(0.22, GOAL_HEIGHT, 0.22), goal_material.albedo_color, Vector3(x, GOAL_HEIGHT * 0.5, -GOAL_WIDTH * 0.5))
	_box(Vector3(0.22, GOAL_HEIGHT, 0.22), goal_material.albedo_color, Vector3(x, GOAL_HEIGHT * 0.5, GOAL_WIDTH * 0.5))
	_box(Vector3(0.22, 0.22, GOAL_WIDTH), goal_material.albedo_color, Vector3(x, GOAL_HEIGHT, 0.0))
	_box(Vector3(0.12, 0.12, GOAL_WIDTH), Color("#8ea8bf"), Vector3(x + depth, 0.05, 0.0))
	for z in [-GOAL_WIDTH * 0.5, 0.0, GOAL_WIDTH * 0.5]:
		_box(Vector3(abs(depth), 0.08, 0.07), Color("#8ea8bf"), Vector3(x + depth * 0.5, GOAL_HEIGHT * 0.5, z))
	for y in [0.0, GOAL_HEIGHT * 0.5, GOAL_HEIGHT]:
		_box(Vector3(0.07, 0.07, GOAL_WIDTH), Color("#8ea8bf"), Vector3(x + depth, y, 0.0))
	var net_material := _make_material(Color(0.5, 0.8, 1.0, 0.16), 1.0)
	net_material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	_box_material(Vector3(0.04, GOAL_HEIGHT, GOAL_WIDTH), net_material, Vector3(x + depth, GOAL_HEIGHT * 0.5, 0.0))


func _make_stands() -> void:
	for side in [-1.0, 1.0]:
		for row in range(3):
			var x: float = float(side) * (53.0 + row * 2.1)
			_box(Vector3(1.5, 0.9 + row * 0.24, 64.0), Color(0.03 + row * 0.015, 0.055 + row * 0.012, 0.11 + row * 0.02), Vector3(x, 0.45 + row * 0.22, 0.0))
	for z in [-34.0, 34.0]:
		_box(Vector3(100.0, 0.7, 1.7), Color("#101c35"), Vector3(0.0, 0.35, z))


func _make_players() -> void:
	player_visual = Athlete.new()
	player_visual.name = "PlayerPresentation"
	player_visual.team_color = Color("#d9423d")
	add_child(player_visual)
	teammate_visual = Athlete.new()
	teammate_visual.name = "TeammatePresentation"
	teammate_visual.team_color = Color("#d9423d")
	teammate_visual.visible = false
	add_child(teammate_visual)
	defender_visual = Athlete.new()
	defender_visual.name = "DefenderPresentation"
	defender_visual.team_color = Color("#2674c9")
	defender_visual.visible = false
	add_child(defender_visual)


func _make_ball() -> void:
	ball_visual = Node3D.new()
	ball_visual.name = "BallPresentation"
	add_child(ball_visual)
	_sphere(0.11, white_material.albedo_color, Vector3.ZERO, ball_visual)
	for dot in [Vector3(0.09, 0.03, 0.0), Vector3(-0.06, 0.05, 0.065), Vector3(-0.04, -0.05, -0.075), Vector3(0.01, 0.085, -0.05)]:
		_sphere(0.022, black_material.albedo_color, dot.normalized() * 0.102, ball_visual)


func _make_environment() -> void:
	var environment := Environment.new()
	environment.background_mode = Environment.BG_COLOR
	environment.background_color = Color("#08162d")
	environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.ambient_light_color = Color("#9ab8e2")
	environment.ambient_light_energy = 0.24
	environment.tonemap_mode = Environment.TONE_MAPPER_LINEAR
	$WorldEnvironment.environment = environment


func _build_hud() -> void:
	hud = CanvasLayer.new()
	hud.layer = 10
	add_child(hud)
	var top := ColorRect.new()
	top.color = Color(0.015, 0.03, 0.075, 0.82)
	top.position = Vector2(0, 0)
	top.size = Vector2(1280, 94)
	hud.add_child(top)
	var title := _hud_label("CAMPO / NATIVO 0.3", 28, Color("#f3f7ff"), Vector2(34, 18), Vector2(430, 38))
	hud.add_child(title)
	var subtitle := _hud_label("ARENA DE TREINO  ·  2v1", 12, Color("#75d6c0"), Vector2(36, 57), Vector2(440, 22))
	hud.add_child(subtitle)
	hud_state = _hud_label("VELOCIDADE  0.0 m/s    CARGA  [················]    GOLS 00    PASSES 00    DESARMES 00    POSSE LIVRE", 14, Color("#f4d58d"), Vector2(430, 35), Vector2(820, 30))
	hud.add_child(hud_state)
	hud_help = _hud_label("WASD / SETAS mover    SHIFT correr    ESPAÇO chutar    J passe e inicia pressão    K desarme    R reiniciar    C câmera    ESC pausar", 14, Color("#d7e7fb"), Vector2(34, 674), Vector2(1200, 28))
	hud.add_child(hud_help)
	var badge := _hud_label("TREINO 2v1", 13, Color("#92a9c7"), Vector2(1050, 62), Vector2(210, 22))
	hud.add_child(badge)
	pause_panel = ColorRect.new()
	pause_panel.color = Color(0.01, 0.02, 0.06, 0.9)
	pause_panel.position = Vector2(370, 235)
	pause_panel.size = Vector2(540, 190)
	pause_panel.visible = false
	hud.add_child(pause_panel)
	var paused := _hud_label("PAUSADO", 32, Color("#f4d58d"), Vector2(170, 30), Vector2(300, 44))
	pause_panel.add_child(paused)
	var paused_help := _hud_label("ESC continuar   ·   R reiniciar", 17, Color("#d7e7fb"), Vector2(135, 105), Vector2(320, 28))
	pause_panel.add_child(paused_help)
	error_panel = ColorRect.new()
	error_panel.color = Color(0.05, 0.015, 0.025, 0.96)
	error_panel.position = Vector2(190, 215)
	error_panel.size = Vector2(900, 250)
	error_panel.visible = false
	hud.add_child(error_panel)
	error_label = _hud_label("", 20, Color("#ffd9c8"), Vector2(36, 36), Vector2(828, 175))
	error_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	error_panel.add_child(error_label)


func _hud_label(text_value: String, font_size: int, color: Color, position_value: Vector2, size_value: Vector2) -> Label:
	var label := Label.new()
	label.text = text_value
	label.position = position_value
	label.size = size_value
	label.add_theme_font_size_override("font_size", font_size)
	label.add_theme_color_override("font_color", color)
	return label


func _show_error(message: String) -> void:
	if error_panel and error_label:
		error_label.text = "CLIENTE NATIVO INDISPONÍVEL\n\n" + message
		error_panel.visible = true


func _parse_command_line() -> void:
	for argument in OS.get_cmdline_user_args():
		if argument == "--smoke":
			smoke_mode = true
		elif argument.begins_with("--capture="):
			smoke_capture_path = argument.trim_prefix("--capture=")


func _finish_smoke(default_code: int) -> void:
	if not smoke_mode or smoke_finished:
		return
	smoke_finished = true
	set_physics_process(false)
	var code := default_code
	if bridge_ready and smoke_tick >= 240:
		var player_delta := _state_vector("player_position", smoke_initial_player).distance_to(smoke_initial_player)
		if player_delta < 0.1 or not smoke_ball_kick_seen:
			code = 1
	if not smoke_capture_path.is_empty() and not strike_capture_saved:
		code = 1
	if code == 0 and not smoke_capture_path.is_empty():
		# Keep the requested capture useful for auditing the imported athlete, and
		# retain the broadcast framing beside it for the arena/goal review.
		set_process(false)
		close_camera = true
		camera_target = field_target
		# Diagnostic close capture stays at the authored 12 m scale; the runtime
		# camera may widen for ball/player separation during normal play.
		camera.position = camera_target + Vector3(0.0, 8.0, 11.0)
		camera.look_at(camera_target, Vector3.UP)
		camera.size = 12.0
		await RenderingServer.frame_post_draw
		var viewport_texture := get_viewport().get_texture()
		if viewport_texture == null:
			code = 1
		else:
			var image := viewport_texture.get_image()
			if image == null or image.save_png(smoke_capture_path) != OK:
				code = 1
			close_camera = false
			camera.position = camera_target + Vector3(0.0, 31.0, 32.0)
			camera.look_at(camera_target, Vector3.UP)
			camera.size = 48.0
			await RenderingServer.frame_post_draw
			var wide_texture := get_viewport().get_texture()
			if wide_texture != null:
				var wide_image := wide_texture.get_image()
				var wide_path := smoke_capture_path.get_basename() + "-wide." + smoke_capture_path.get_extension()
				if wide_image == null or wide_image.save_png(wide_path) != OK:
					code = 1
	get_tree().quit(code)


func _make_material(color: Color, roughness: float, emission: Color = Color(0, 0, 0, 1)) -> StandardMaterial3D:
	var material := StandardMaterial3D.new()
	material.albedo_color = color
	material.roughness = roughness
	if emission != Color(0, 0, 0, 1):
		material.emission_enabled = true
		material.emission = emission
		material.emission_energy_multiplier = 0.35
	return material


func _box(size: Vector3, color: Color, position_value: Vector3) -> MeshInstance3D:
	return _box_material(size, _make_material(color, 0.75), position_value)


func _box_material(size: Vector3, material: Material, position_value: Vector3, parent: Node = null) -> MeshInstance3D:
	var mesh := BoxMesh.new()
	mesh.size = size
	var node := MeshInstance3D.new()
	node.mesh = mesh
	node.material_override = material
	node.position = position_value
	(parent if parent else self).add_child(node)
	return node


func _box_parent(size: Vector3, material: Material, position_value: Vector3, parent: Node) -> MeshInstance3D:
	return _box_material(size, material, position_value, parent)


func _sphere(radius: float, color: Color, position_value: Vector3, parent: Node = null) -> MeshInstance3D:
	return _sphere_material(radius, _make_material(color, 0.55), position_value, parent)


func _sphere_material(radius: float, material: Material, position_value: Vector3, parent: Node = null) -> MeshInstance3D:
	var mesh := SphereMesh.new()
	mesh.radius = radius
	mesh.height = radius * 2.0
	var node := MeshInstance3D.new()
	node.mesh = mesh
	node.material_override = material
	node.position = position_value
	(parent if parent else self).add_child(node)
	return node


func _capsule(radius: float, height: float, color: Color, position_value: Vector3, parent: Node) -> MeshInstance3D:
	var mesh := CapsuleMesh.new()
	mesh.radius = radius
	mesh.height = height
	var node := MeshInstance3D.new()
	node.mesh = mesh
	node.material_override = _make_material(color, 0.58)
	node.position = position_value
	parent.add_child(node)
	return node


func _cylinder_parent(radius: float, height: float, color: Color, position_value: Vector3, parent: Node) -> MeshInstance3D:
	var mesh := CylinderMesh.new()
	mesh.top_radius = radius
	mesh.bottom_radius = radius
	mesh.height = height
	var node := MeshInstance3D.new()
	node.mesh = mesh
	node.material_override = _make_material(color, 0.65)
	node.position = position_value
	parent.add_child(node)
	return node


func _add_quad(vertices: PackedVector3Array, indices: PackedInt32Array, a: Vector3, b: Vector3, c: Vector3, d: Vector3) -> void:
	var start := vertices.size()
	vertices.append_array(PackedVector3Array([a, b, c, d]))
	indices.append_array(PackedInt32Array([start, start + 1, start + 2, start, start + 2, start + 3]))


func _add_segment(vertices: PackedVector3Array, indices: PackedInt32Array, a: Vector3, b: Vector3, thickness: float) -> void:
	var direction := Vector2(b.x - a.x, b.z - a.z).normalized()
	var normal := Vector3(-direction.y, 0.0, direction.x) * thickness * 0.5
	_add_quad(vertices, indices, a - normal, a + normal, b + normal, b - normal)


func _add_line_rect(vertices: PackedVector3Array, indices: PackedInt32Array, rect: Rect2, thickness: float, y: float) -> void:
	var a := Vector3(rect.position.x, y, rect.position.y)
	var b := Vector3(rect.end.x, y, rect.position.y)
	var c := Vector3(rect.end.x, y, rect.end.y)
	var d := Vector3(rect.position.x, y, rect.end.y)
	_add_segment(vertices, indices, a, b, thickness)
	_add_segment(vertices, indices, b, c, thickness)
	_add_segment(vertices, indices, c, d, thickness)
	_add_segment(vertices, indices, d, a, thickness)


func _mesh_from_arrays(vertices: PackedVector3Array, indices: PackedInt32Array, material: Material) -> MeshInstance3D:
	var arrays: Array = []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = vertices
	arrays[Mesh.ARRAY_INDEX] = indices
	var normals := PackedVector3Array()
	for _vertex in vertices:
		normals.append(Vector3.UP)
	arrays[Mesh.ARRAY_NORMAL] = normals
	var mesh := ArrayMesh.new()
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	var node := MeshInstance3D.new()
	node.mesh = mesh
	node.material_override = material
	add_child(node)
	return node
