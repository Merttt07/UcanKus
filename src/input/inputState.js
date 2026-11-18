// Ortak giriş durumu: kamera (poz) kontrolü ya da yedek olarak dokunma/klavye buraya yazar,
// fizik sadece buradan okur.
export const inputState = {
  pendingFlaps: 0, // tüketilmeyi bekleyen çırpma sayısı
  flapStrength: 1, // yükseltme gücü; kamerada çırpma hızına göre değişir (tek kolda daha az)
  steer: 0,        // klavye/dokunma dönüşü: -1 (sol) .. 1 (sağ). Kamerada kullanılmaz.
  turnImpulse: 0,  // tek kol çırpışlarından gelen dönüş: + sağa, - sola, büyüklüğü çırpış gücü
  poseActive: false, // kamera çalışıyorsa true → tuş/dokunma uçuşu kontrol etmez

  // strength: yükseltme gücü. turn: tek kol çırpışıysa o tarafa dönüş gücü (+ sağ, - sol), yoksa 0.
  flap(strength = 1, turn = 0) {
    this.pendingFlaps = Math.min(this.pendingFlaps + 1, 2);
    this.flapStrength = strength;
    this.turnImpulse = Math.max(-2, Math.min(2, this.turnImpulse + turn));
  },
  consumeTurnImpulse() {
    const v = this.turnImpulse;
    this.turnImpulse = 0;
    return v;
  },
  consumeFlap() {
    if (this.pendingFlaps > 0) { this.pendingFlaps--; return this.flapStrength; }
    return 0;
  },
  // Menüdeyken basılan çırpmalar biriktirilmesin, oyuna dönünce kuş zıplamasın.
  clearFlaps() {
    this.pendingFlaps = 0;
    this.turnImpulse = 0;
  },
};
