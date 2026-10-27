# От идеи к решению — интерактивная презентация

Статический сайт без сборки: `index.html` + `app.js` + `content.js` + папка `assets/`.
Работает в любом браузере, разрешение слайда 1920×1080 масштабируется под окно.

## Структура

| Файл | Что внутри |
|---|---|
| `index.html` | Разметка и стили |
| `app.js` | Отрисовка, анимации, навигация (клавиатура, кликер, свайп) |
| `content.js` | Все тексты и данные слайдов — править контент только здесь |
| `assets/` | Картинки, логотипы, шрифт Manrope, QR-код |

## Деплой

Подойдёт любой веб-сервер, который отдаёт статические файлы. Скопируйте в корень сайта:

```
index.html  app.js  content.js  icon.svg  assets/
```

### Nginx

```nginx
server {
    listen 80;
    server_name example.com;
    root /var/www/idea-to-decision;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # картинки и шрифты меняются редко
    location /assets/ {
        expires 7d;
    }
}
```

### Docker

```bash
docker build -t idea-to-decision .
docker run -d -p 8080:80 idea-to-decision
```

Сайт откроется на http://localhost:8080.

### Локальный просмотр

```bash
python3 -m http.server 8000
```

Откройте http://localhost:8000. Открывать `index.html` двойным кликом не стоит: часть браузеров блокирует загрузку скриптов с `file://`.

## Что учесть

- Внешних зависимостей нет: шрифт и все картинки лежат в `assets/`, интернет на показе не нужен.
- Ссылки во вкладках «Артефакты» ведут во внутренние системы (wiki, GitLab, Grafana, lab-стенды) — открываются только из сети компании.
- QR-код на обложке (`assets/qr.svg`) ведёт на https://idea-to-decision.vercel.app. При переезде на другой адрес его нужно перегенерировать.
