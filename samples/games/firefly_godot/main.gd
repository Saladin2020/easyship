extends Node2D
## หิ่งห้อย · Firefly Night — the Easy Ship sample game. Click / tap fireflies over the rice field before dawn.
## Deterministic (seeded) so builds can be smoke-tested: `--quit-after` frames prints the score line.

const W := 480
const H := 270
const COUNT := 14
const NIGHT_SECONDS := 60.0

var flies: Array = []
var score := 0
var t := 0.0
var rng := RandomNumberGenerator.new()
var font: Font
var lang := "th"


func _ready() -> void:
	rng.seed = 2026
	font = load("res://fonts/Kanit-Regular.ttf")
	for i in COUNT:
		flies.append(_new_fly())
	if OS.has_feature("web"):
		lang = "th"
	print("FIREFLY READY %s" % ProjectSettings.get_setting("application/config/version"))


func _new_fly() -> Dictionary:
	return {"p": Vector2(rng.randf_range(20, W - 20), rng.randf_range(40, H - 70)), "v": Vector2(rng.randf_range(-12, 12), rng.randf_range(-8, 8)), "phase": rng.randf() * TAU}


func _process(delta: float) -> void:
	t += delta
	for f in flies:
		f.v += Vector2(rng.randf_range(-20, 20), rng.randf_range(-20, 20)) * delta
		f.v = f.v.limit_length(18.0)
		f.p += f.v * delta
		f.p.x = wrapf(f.p.x, 0, W)
		f.p.y = clampf(f.p.y, 30, H - 60)
	queue_redraw()


func _unhandled_input(e: InputEvent) -> void:
	var pos := Vector2.INF
	if e is InputEventMouseButton and e.pressed:
		pos = e.position
	elif e is InputEventScreenTouch and e.pressed:
		pos = e.position
	if pos == Vector2.INF:
		if e is InputEventKey and e.pressed and e.keycode == KEY_L:
			lang = "en" if lang == "th" else "th"
		return
	for i in flies.size():
		if flies[i].p.distance_to(pos) < 12.0:
			score += 1
			flies[i] = _new_fly()
			break


func _draw() -> void:
	var dawn := clampf(t / NIGHT_SECONDS, 0.0, 1.0)
	draw_rect(Rect2(0, 0, W, H), Color("#0b1630").lerp(Color("#3a3a6a"), dawn))
	for i in 40:
		var sx := float((i * 97) % W)
		var sy := float((i * 53) % 120)
		draw_rect(Rect2(sx, sy, 1, 1), Color(1, 1, 0.9, 0.6 - dawn * 0.5))
	# rice field and palm silhouettes
	draw_rect(Rect2(0, H - 60, W, 60), Color("#0f2a18"))
	for x in range(0, W, 6):
		draw_line(Vector2(x, H - 60), Vector2(x + 2, H - 70 - (x * 7) % 9), Color("#1d4a2a"), 1.0)
	for px in [60, 380]:
		draw_rect(Rect2(px, H - 140, 4, 80), Color("#081008"))
		for a in 5:
			var ang := -PI / 2 + (a - 2) * 0.55
			draw_line(Vector2(px + 2, H - 140), Vector2(px + 2, H - 140) + Vector2(cos(ang), sin(ang) + 0.6) * 26, Color("#081008"), 3.0)
	# a stilt house with a warm window
	draw_rect(Rect2(250, H - 110, 70, 40), Color("#140c06"))
	draw_colored_polygon(PackedVector2Array([Vector2(242, H - 110), Vector2(285, H - 140), Vector2(328, H - 110)]), Color("#140c06"))
	draw_rect(Rect2(275, H - 100, 14, 12), Color("#f4ae3d"))
	for x in [254, 314]:
		draw_rect(Rect2(x, H - 70, 3, 14), Color("#140c06"))
	for f in flies:
		var glow := 0.55 + 0.45 * sin(t * 3.0 + f.phase)
		draw_circle(f.p, 5.0, Color(1.0, 0.95, 0.4, 0.18 * glow))
		draw_rect(Rect2(f.p.x - 1, f.p.y - 1, 2, 2), Color(1.0, 0.95, 0.5, glow))
	var left := maxf(0.0, NIGHT_SECONDS - t)
	var txt := ("หิ่งห้อย %d ตัว · อีก %d วินาทีฟ้าสาง" % [score, int(left)]) if lang == "th" else ("Fireflies %d · dawn in %d s" % [score, int(left)])
	draw_string(font, Vector2(10, 22), txt, HORIZONTAL_ALIGNMENT_LEFT, -1, 14, Color("#f7ebd3"))
