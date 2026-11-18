import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

export default defineConfig({
  base: './',
  // Tarayıcılar kamerayı sadece https:// ya da localhost'ta açar. Telefondan bilgisayarın
  // yerel adresine bağlanınca da kamera çalışsın diye kendinden imzalı sertifikayla https.
  // (İlk açılışta tarayıcı "güvenli değil" uyarısı verir: "Gelişmiş → yine de devam et".)
  plugins: [basicSsl()],
  server: { host: true },
  preview: { host: true },
});
