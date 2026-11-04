"""Build a self-contained comparison from the Playwright screenshots in this folder."""
import base64
import json
from pathlib import Path

root = Path(__file__).parent
images = {f"{theme}-{variant}": "data:image/png;base64," + base64.b64encode((root / f"{theme}-{variant}.png").read_bytes()).decode()
          for theme in ["dark", "light"] for variant in "abc"}
html = """<!doctype html><html lang="ru" data-theme="dark"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Расписание — три варианта разделения дней</title>
<style>
*{box-sizing:border-box}html{font-family:system-ui,sans-serif;color:#e7ebf3;background:#10141b}body{margin:0;padding:28px;max-width:1580px;margin:auto}h1{font-size:28px;letter-spacing:-.6px;margin:5px 0 10px}p{color:#a7b3c6;font-size:14px;line-height:1.55;margin:8px 0}header{display:flex;justify-content:space-between;gap:24px;align-items:center;margin-bottom:24px}.eyebrow{font-size:11px;letter-spacing:2px;color:#70d9d5;text-transform:uppercase}.themes{display:flex;gap:5px;padding:4px;border:1px solid #354052;border-radius:12px}button{font:inherit;cursor:pointer}.themes button{background:transparent;color:inherit;border:0;border-radius:8px;padding:9px 14px}.themes button[aria-pressed=true]{background:#285c65;color:white}.cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}article{border:1px solid #344052;border-radius:15px;overflow:hidden;background:#171d27}article.recommended{border-color:#60c9c2}.copy{padding:18px 18px 14px;min-height:130px}.tag{display:inline-block;font-size:10px;letter-spacing:.5px;border:1px solid #478680;border-radius:30px;padding:3px 7px;color:#94e5df;margin-left:8px}h2{font-size:18px;margin:0 0 9px;font-weight:650}.shot{display:block;background:none;border:0;padding:0;width:100%;line-height:0}.shot img{display:block;width:100%;height:auto}.note{margin-top:20px;font-size:12px}dialog{padding:12px;background:#171d27;color:white;border:1px solid #52647b;border-radius:12px;max-width:96vw;max-height:96vh}dialog::backdrop{background:#000b}dialog img{display:block;max-width:85vw;max-height:82vh}dialog button{display:block;margin:0 0 8px auto;padding:6px 12px;border:0;border-radius:6px}html[data-theme=light]{color:#1c2d3c;background:#edf2f6}html[data-theme=light] article{background:white;border-color:#bac8d4}html[data-theme=light] p{color:#4c6174}html[data-theme=light] .eyebrow{color:#256972}html[data-theme=light] .tag{color:#256972}html[data-theme=light] .recommended{border-color:#287e83}@media(max-width:760px){body{padding:16px}header{display:block}.themes{width:max-content;margin-top:18px}.cards{grid-template-columns:1fr;max-width:480px;margin:auto}.copy{min-height:0}h1{font-size:24px}}
</style>
<header><div><div class="eyebrow">Red Party · варианты оформления</div><h1>Чуть больше воздуха между днями</h1><p>Одинаковая сетка, отступ от края 6 px, промежуток между днями 8 px.<br>Нажмите на снимок, чтобы рассмотреть его крупнее.</p></div><div class="themes" aria-label="Тема"><button aria-pressed="true" data-theme="dark">Тёмная</button><button aria-pressed="false" data-theme="light">Светлая</button></div></header>
<main class="cards">
<article><div class="copy"><h2>A · Чёткая рамка</h2><p>Рамка 2 px. Граница дня заметнее, фон остаётся прежним.</p></div><button class="shot" data-variant="a" aria-label="Увеличить вариант A"><img alt="Вариант A: чёткая рамка"></button></article>
<article class="recommended"><div class="copy"><h2>B · Рамка и фон <span class="tag">Исходный вариант</span></h2><p>Рамка 1,5 px и немного контрастнее фон. День читается как отдельный блок.</p></div><button class="shot" data-variant="b" aria-label="Увеличить вариант B"><img alt="Вариант B: рамка и фон"></button></article>
<article><div class="copy"><h2>C · Мягкое свечение</h2><p>Тонкая рамка и спокойный внешний ореол. Без пульсации и яркого цветного свечения.</p></div><button class="shot" data-variant="c" aria-label="Увеличить вариант C"><img alt="Вариант C: мягкое свечение"></button></article>
</main><p class="note">Историческое сравнение на Demo. После выбора C свечение заменено отличающимся фоном поля; рамка 2 px, отступ 4 px. Итоговые снимки: final-dark.png и final-light.png.</p>
<dialog><button aria-label="Закрыть увеличенный снимок">Закрыть</button><img alt="Увеличенный вариант"></dialog>
<script>
const images=__IMAGES__;let theme='dark';const dialog=document.querySelector('dialog');
function render(){document.documentElement.dataset.theme=theme;document.querySelectorAll('.themes button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.theme===theme)));document.querySelectorAll('.shot').forEach(b=>b.querySelector('img').src=images[theme+'-'+b.dataset.variant])}
document.querySelectorAll('.themes button').forEach(b=>b.onclick=()=>{theme=b.dataset.theme;render()});
document.querySelectorAll('.shot').forEach(b=>b.onclick=()=>{dialog.querySelector('img').src=images[theme+'-'+b.dataset.variant];dialog.showModal()});dialog.querySelector('button').onclick=()=>dialog.close();dialog.onclick=e=>{if(e.target===dialog)dialog.close()};render();
</script></html>"""
(root / "index.html").write_text(html.replace("__IMAGES__", json.dumps(images)), encoding="utf-8")
print(root / "index.html")
