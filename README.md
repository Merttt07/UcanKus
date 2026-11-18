# UçanKuş

Tarayıcıda çalışan 3B uçuş oyunu. Kuşu kollarınla, kamera karşısında kanat çırparak yönetiyorsun. Uzaktaki dağların önünde, Çin manzaralarındaki gibi ince uzun kaya sütunlarının arasından uçup halka topluyorsun.

Three.js ile yazıldı, Vite ile çalıştırılıyor. Vücut algılama için MediaPipe Pose kullanılıyor.

## Nasıl oynanır

Kameradan 1,5–2 m uzakta dur; omuzların ve kolların görüntüde olsun.

| Hareket | Ne yapar |
|---|---|
| İki kolu birlikte aşağı çırp | Kuş yükselir |
| Tek kolu aşağı çırp | Kuş o tarafa döner. Ters kolla çırpmak mevcut dönüşü hemen tersine çevirir. |
| İki elini başının üstünde ~1 sn tut | Oyunu durdurur / devam ettirir |

Kolunu sonuna kadar indirmen gerekmez; kısa ve hızlı bir aşağı hareket yeterli. Kamera açılamazsa oyun dokunma ve klavyeyle de oynanabilir: dokun / Space ile çırp, ekranın sol-sağ kenarı / A-D ile dön, ESC ile dur.

Halkalardan geçmek puan verir. Kayaya, ağaca, yere ya da göle çarparsan oyun biter.

## Çalıştırma

```bash
npm install
npm run dev
```

Terminalde iki adres çıkar:

- **Bilgisayarda:** `https://localhost:5173/` adresini aç.
- **Telefonda:** telefon bilgisayarla aynı Wi-Fi ağında olsun ve `Network: https://...` adresini aç.

Tarayıcılar kamerayı sadece HTTPS'te açtığı için geliştirme sunucusu kendi ürettiği bir sertifikayla çalışıyor. İlk açılışta çıkan "bağlantı gizli değil" uyarısını "Gelişmiş → yine de devam et" ile geç.

Derlemek için `npm run build` çalıştır; çıktı `dist/` klasörüne yazılır.

## Grafik kalitesi

Telefon kendiliğinden algılanır ve düşük kaliteye geçilir. Oyun sırasında kare hızı düşerse çözünürlük de kendiliğinden azalır. Kaliteyi elle seçmek için adresin sonuna `?kalite=dusuk` ya da `?kalite=yuksek` ekle. Bütün ayarlar `src/game/quality.js` dosyasında.

## Kod yapısı

```
src/
  main.js              oyun döngüsü ve durumlar (başlangıç, oyun, durdurma, oyun sonu)
  game/
    bird.js            kuş modeli ve uçuş fiziği (FLIGHT ayarları)
    obstacles.js       kaya formasyonlarını ve halkaları üretme, çarpışma (COURSE ayarları)
    formations.js      formasyon şekilleri: ters U, ters L, R, ay kapısı, sütun ormanı
    karst.js           kaya sütunu, kemer ve sarmaşık görünümü
    terrain.js         tepeli arazi ve göller
    decor.js           ağaçlar ve çiçekler
    backdrop.js        ufuktaki sabit dağ manzarası
    quality.js         grafik kalitesi ayarları
  input/
    poseInput.js       kamera ve vücut algılama (ayrı işçide çalışır)
    poseWorker.js      MediaPipe Pose işçisi
    wingGesture.js     vücut noktalarından çırpış ve tek kol dönüşü çıkarma (GESTURE ayarları)
    touchInput.js      yedek kontrol: dokunma ve klavye
    inputState.js      bütün kontrollerin fiziğe aktardığı ortak durum
  ui/menu.js           menüler ve skor
public/models/         MediaPipe poz modeli (pose_landmarker_lite.task)
```
