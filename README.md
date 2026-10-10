<img width="100%" src="https://capsule-render.vercel.app/api?type=waving&height=200&section=header&color=0:FF0000,100:3776AB&text=Oto%20M%C3%BCzik&fontSize=56&fontColor=FFFFFF&fontAlignY=34&animation=fadeIn&desc=YouTube%20m%C3%BCzik%20indirme%20ve%20oynatma%20uygulamas%C4%B1.&descSize=18&descAlignY=55" alt="Oto Müzik" />

<div align="center">

</div>

Oto Müzik, kullanıcılarına YouTube'dan müzik indirme ve oynatma yeteneklerini sunan bir uygulamadır. Kullanıcılar, uygulamayı kullanarak kuyruğa şarkı ekleyebilir, indirmeyi kontrol edebilir ve oynatma durumunu izleyebilir. Bu uygulama, kullanıcı arayüzünün ve API'nin yönetimi için çeşitli özellikler sunar.

<p align="center">
  <img src="https://skillicons.dev/icons?i=py,fastapi&perline=2" height="48" alt="python, fastapi" />
</p>

<details>
<summary><b>📋 İçindekiler</b></summary>

- [✨ Özellikler](#-özellikler)
- [⚙️ Nasıl Çalışır](#-nasıl-çalışır)
- [📦 Kurulum](#-kurulum)
- [🚀 Kullanım](#-kullanım)
- [🔌 API Referansı](#-api-referansı)
- [📁 Proje Yapısı](#-proje-yapısı)
- [🤝 Katkıda Bulunma](#-katkıda-bulunma)
- [👤 Geliştirici](#-geliştirici)

</details>

## ✨ Özellikler

### ▶ Kullanıcı Arayüzü

- Oynatma durumunu izleme
- Hata mesajlarını okuma
- Güncellemeleri izleme

### 🔗 Kuyruk Yönetimi

- Şarkı kuyruğuna şarkı ekleme
- Kuyruktaki şarkıları silme
- Kuyruğu temizleme
- Şarkı sırasını düzenleme

### ⬇ İndirme İşlemleri

- YouTube bağlantısından şarkı indirme
- İndirme işlemini başlatma
- İndirme işlemini durdurma
- İndirme durumunu kontrol etme

### 📝 Metin Girişi

- YouTube bağlantısını metin alanına girme

### 📂 Dosya Yönetimi

- Dosya yükleme
- Listeye dosya ekleme
- İndirmeyi başlatma


## ⚙️ Nasıl Çalışır

```mermaid
flowchart LR
  S0["Kullanıcı Giriş"]
  S1["Şarkı Ekleme"]
  S2["İndirme İşlemi"]
  S3["Oynatma"]
  S4["Güncelleme"]
  S0 --> S1
  S1 --> S2
  S2 --> S3
  S3 --> S4
```

1. **Kullanıcı Giriş** — Kullanıcı uygulamayı başlatır ve giriş yapar
2. **Şarkı Ekleme** — Kullanıcı metin alanına YouTube bağlantısı girerek şarkıyı kuyruğa ekler
3. **İndirme İşlemi** — Kuyruktaki şarkı indirilir ve indirme işlemi başlatılır
4. **Oynatma** — Kullanıcı indirilmiş şarkıları oynatma kuyruğunda yönetebilir ve oynatma durumunu izleyebilir
5. **Güncelleme** — Kullanıcı ayarlarını günceller ve uygulamayı kapatır

| Bileşen | Görev |
| --- | --- |
| `PART static` | Kullanıcı arayüzünün görsel olarak düzgün çalışmasını sağlar |
| `PART (kök)` | Uygulamanın kontrolü ve yönetimi sağlar |
| `PART templates` | Kullanıcıya metin giriş, dosya yükleme, listedeki dosyaları düzenleme ve indirme işlemi başlatma yetkilerini sağlar |

## 📦 Kurulum

**Gereksinimler:** Python 3.10+

```bash
# Repoyu klonlayın
git clone https://github.com/Burakcnz/oto-muzik.git
cd oto-muzik

# Sanal ortam oluşturun
python -m venv .venv

# Sanal ortamı etkinleştirin (macOS/Linux: source .venv/bin/activate)
.venv\Scripts\activate

# Bağımlılıkları yükleyin
pip install yt-dlp fastapi pydantic starlette uvicorn
```

## 🚀 Kullanım

```bash
python app.py
```

Uygulama varsayılan olarak <http://localhost:8000> adresinde açılır. Windows'ta `başlat.bat` dosyasına çift tıklayarak da başlatabilirsiniz.

#### Şarkı İndirme ve Oynatma

1. YouTube bağlantısını metin alanına gir
2. Şarkıyı kuyruğa ekleyin
3. İndirme işlemini başlat
4. İndirilmiş şarkıyı oynatma kuyruğunda yönet
5. Oynatma durumunu izle

#### Kuyruk Yönetimi

1. Kuyruğa şarkı ekle
2. Kuyruktaki şarkıları sırala
3. Kuyruktaki şarkıları sil
4. Kuyruğu temizle

## 🔌 API Referansı

Toplam **19** uç nokta.

<details>
<summary><b>app.py</b> (19)</summary>

| Yöntem | Yol | Açıklama |
| --- | --- | --- |
| `GET` | `/` | Ana sayfayı yükler |
| `POST` | `/api/parse` | YouTube URL'sinden şarkı URL'sini çıkarır |
| `POST` | `/api/queue/{song_id}/remove` | Kuyruktaki belirli bir şarkıyı siler |
| `POST` | `/api/queue/clear` | Kuyruğu temizler |
| `POST` | `/api/completed/clear` | Tamamlanmış indirme listesini temizler |
| `POST` | `/api/errors/clear` | Hata listesini temizler |
| `POST` | `/api/errors/{song_id}/remove` | Belirli bir hata kaydını siler |
| `POST` | `/api/errors/{song_id}/retry` | Belirli bir hata kaydını yeniden deneme |
| `POST` | `/api/queue/reorder` | Kuyruğun sırasını yeniden düzenler |
| `POST` | `/api/download/start` | İndirme işlemini başlatır |
| `POST` | `/api/download/pause` | İndirme işlemini durdurur |
| `POST` | `/api/download/stop` | İndirme işlemini durdurur |
| `POST` | `/api/open-folder` | Dosya yolunu açar |
| `POST` | `/api/open-file/{song_id}` | Belirli bir şarkı dosyasını açar |
| `GET` | `/api/stats` | Uygulama istatistiklerini alır |
| `GET` | `/api/settings` | Kullanıcı ayarlarını JSON formatında alır |
| `POST` | `/api/settings` | Kullanıcı ayarlarını JSON formatında günceller |
| `POST` | `/api/select-video` | YouTube videonun seçili olup olmadığını belirler |
| `WS` | `/ws` | WebSocket uç noktasını başlatır |

</details>

## 📁 Proje Yapısı

```text
├── static/     # Bu bölüm, uygulamanın statik dosyalarını yöneterek kullanıcı arayüz…
│   ├── app.js
│   └── style.css
├── templates/  # Bu bölüm, kullanıcıya metin giriş, dosya yükleme, listedeki dosyala…
│   └── index.html
├── app.py
├── başlat.bat
└── project_info.txt
```

## 🤝 Katkıda Bulunma

Katkılarınızı bekliyoruz! Şu adımları izleyin:

1. Repoyu fork'layın
2. Yeni bir dal oluşturun (`git checkout -b ozellik/yeni-ozellik`)
3. Değişikliklerinizi commit'leyin (`git commit -m 'Yeni özellik ekle'`)
4. Dalınızı push'layın (`git push origin ozellik/yeni-ozellik`)
5. Bir Pull Request açın

## 👤 Geliştirici

<p align="center">
  <a href="https://github.com/Burakcnz"><img src="https://github.com/Burakcnz.png?size=120" width="110" alt="Burak Can Zengin" /></a>
  <br />
  <b>Burak Can Zengin</b> · <a href="https://github.com/Burakcnz">@Burakcnz</a>
</p>

<p align="center"><a href="https://github.com/Burakcnz/oto-muzik">⭐ Projeyi beğendiyseniz yıldız vermeyi unutmayın!</a></p>

<img width="100%" src="https://capsule-render.vercel.app/api?type=waving&height=110&section=footer&color=0:FF0000,100:3776AB" alt="" />
