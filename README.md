<div align="center">

<img width="100%" src="https://capsule-render.vercel.app/api?type=waving&height=120&section=header&color=0:0d1117,50:1a1b26,100:414868&fontSize=70&fontColor=FFFFFF" />

</div>

<div align="center">

<h1>Oto Müzik</h1>

![License](https://img.shields.io/badge/License-MIT-blue?style=flat&logo=mit&logoColor=white) ![PRs](https://img.shields.io/badge/PRs-Welcome-brightgreen?style=flat&logo=git&logoColor=white)

<i>Streamlined Music Queue Management</i>


---

</div>

<div align="center">

<img src="https://skillicons.dev/icons?i=fastapi" height="45" />

</div>

<h2 align="center">✨ Features</h2>

<p align="center">
🚀 <b>/</b> — Manages audio queue with removal and clearing endpoints<br>
🔗 <b>/api/download/start</b> — Initiates downloads for queued songs from URL<br>
📁 <b>/open-folder</b> — Opens download folder containing newly downloaded files<br>
🔍 <b>/api/queue/{song_id}/remove</b> — Removes specific song IDs from the queue<br>
⏱️ <b>/stats</b> — Provides statistics on queue activity and progress<br>
</p>

<h2 align="center">🛠️ Tech Stack</h2>

<p align="center">
<img src="https://img.shields.io/badge/FastAPI-009688?style=flat&logo=fastapi&logoColor=white" alt="FastAPI" title="FastAPI" />
</p>

<h2 align="center">📦 Installation</h2>

```bash
# Clone
git clone https://github.com/Burakcnz/oto-muzik.git
cd Oto Müzik

# Install
pip install -r requirements.txt

# Run
python main.py

```

<h2 align="center">🚀 Usage</h2>

To use this app, simply run `python app.py` in your terminal. After launching, you can access the main page by navigating to `/`. From there, songs are added via an endpoint like `/api/queue/start/{url}`, where `{url}` is a download link from YouTube or another audio source. Songs removed and downloaded files will appear under the `/open-folder` route. For real-time updates on queue status changes, connect a WebSocket client by accessing `ws://localhost:8000/ws`.

The application will be available at `http://localhost:3000`.


<h2 align="center">📁 Project Structure</h2>

```
├── app.py
├── başlat.bat
├── static/
│   ├── app.js
│   ├── style.css
├── templates/
│   ├── index.html
```

<p align="center">⭐ ⭐ ⭐</p>

<h2 align="center">📊 Stats</h2>

<div align="center">

<img src="https://github-readme-stats.vercel.app/api?username=Burakcnz&theme=dracula&hide_border=true&show_icons=true" width="400" />

<img src="https://github-readme-stats.vercel.app/api/top-langs?username=Burakcnz&theme=dracula&hide_border=true&layout=compact&langs_count=8" width="400" />

<img src="https://github-profile-trophy.vercel.app?username=Burakcnz&theme=dracula&no-frame=true&column=7" />

</div>

<h2 align="center">📄 License</h2>

This project is licensed under the MIT License. - see the [LICENSE](LICENSE) file for details.