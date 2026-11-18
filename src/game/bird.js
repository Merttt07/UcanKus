import * as THREE from 'three';

// Uçuş ayarları: uçuş hissi buradan ayarlanır.
export const FLIGHT = {
  gravity: 16,         // m/s² aşağı (yüksek → kuş hızlı düşer)
  glideSink: 9,        // en fazla düşüş hızı (m/s)
  flapLift: 8,         // çırpma başına yukarı hız
  maxRise: 12,         // üst üste çırpınca çıkılabilecek en yüksek yukarı hız
  forwardSpeed: 19,    // SABİT ileri hız (m/s), kuş baktığı yöne uçar
  turnRate: 1.6,       // rad/s, klavye/dokunmada en hızlı dönüş (steer = ±1)
  // Tek kol çırpışıyla dönüş (kamera): her çırpış o tarafa bir "eğim" ekler, eğim yavaşça söner.
  flapTurn: 0.35,      // bir çırpışın eklediği dönüş hızı (rad/s, güç 1'de) → yaklaşık 30° dönüş
  maxBank: 1.3,        // üst üste çırpışlarla ulaşılabilecek en hızlı dönüş (rad/s)
  bankDecay: 0.7,      // eğimin kendiliğinden düzelme hızı (1/s): düşük → dönüş daha uzun sürer
  reverseGain: 0.5,    // ters kolla çırpınca: mevcut dönüş tamamen silinir ve en az bu oranda
                       // öbür yöne dönülür (ne kadar sert dönüyor olursan ol, tek çırpış yetsin)
  turnSmoothing: 5,    // dönüşe girerken dönüş hızı hedefe ne çabuk ulaşır (1/s): yumuşak giriş
  turnRelease: 10,     // dönüşü bırakırken ya da ters yöne geçerken (1/s): anında toparlanır
  maxY: 34,            // tavan (mutlak yükseklik)
  radius: 0.5,         // çarpışma küresi yarıçapı
};

export function createBird() {
  const root = new THREE.Group(); // konum + yön (yaw)
  const body = new THREE.Group(); // yatış (bank) + burun açısı (pitch)
  root.add(body);

  const green = new THREE.MeshLambertMaterial({ color: '#5cc46a', flatShading: true });
  const dark = new THREE.MeshLambertMaterial({ color: '#3f9a52', flatShading: true });
  const orange = new THREE.MeshLambertMaterial({ color: '#f2a13b', flatShading: true });
  const white = new THREE.MeshLambertMaterial({ color: '#ffffff' });
  const black = new THREE.MeshLambertMaterial({ color: '#222222' });

  body.add(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.8, 1.4), green));

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.7), green);
  head.position.set(0, 0.35, -0.85);
  body.add(head);

  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.45, 4), orange);
  beak.rotation.x = -Math.PI / 2;
  beak.position.set(0, 0.3, -1.35);
  body.add(beak);

  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.05), white);
    eye.position.set(sx * 0.22, 0.48, -1.21);
    const pupil = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.03), black);
    pupil.position.set(0, 0, -0.03);
    eye.add(pupil);
    body.add(eye);
  }

  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.1, 0.6), dark);
  tail.position.set(0, 0.1, 0.9);
  tail.rotation.x = 0.25;
  body.add(tail);

  // Kanatlar: omuzdan dönen pivotlar.
  const wings = [];
  for (const sx of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(sx * 0.45, 0.15, -0.1);
    const wing = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.08, 0.8), dark);
    wing.position.x = sx * 0.7;
    pivot.add(wing);
    body.add(pivot);
    wings.push({ pivot, side: sx });
  }

  const bird = {
    object: root,
    position: root.position,
    forward: new THREE.Vector3(0, 0, -1),
    radius: FLIGHT.radius,
    yaw: 0,
    yawRate: 0,  // şu anki dönüş hızı (rad/s, + = sağa); ani değil yumuşak değişir
    turnBank: 0, // tek kol çırpışlarından biriken, yavaşça sönen dönüş hedefi (rad/s)
    vy: 0,
    bank: 0,
    flapAnim: 0, // çırpınca 1 olur, zamanla 0'a iner

    reset(startY = 8) {
      root.position.set(0, startY, 0);
      root.rotation.set(0, 0, 0);
      body.rotation.set(0, 0, 0);
      this.yaw = 0;
      this.yawRate = 0;
      this.turnBank = 0;
      this.forward.set(0, 0, -1);
      this.vy = 0;
      this.bank = 0;
      this.flapAnim = 0;
    },

    // floorY: kuşun altındaki yer ya da göl yüzeyinin yüksekliği.
    update(dt, input, floorY = 0) {
      // Çırpma: sadece yukarı dürtü (ileri hız sabit).
      const strength = input.consumeFlap();
      if (strength > 0) {
        this.vy = Math.min(Math.max(this.vy, 0) + FLIGHT.flapLift * strength, FLIGHT.maxRise);
        this.flapAnim = 1;
      }

      // Dikey: yerçekimi, düşüş hızı sınırlı.
      this.vy -= FLIGHT.gravity * dt;
      if (this.vy < -FLIGHT.glideSink) this.vy = -FLIGHT.glideSink;

      // Yön: harita açık ve sınırsız. Hedef dönüş hızı = klavye/dokunma isteği + tek kol
      // çırpışlarının biriktirdiği eğim. Dönüş hızı bu hedefe yumuşakça yaklaşır.
      this.applyTurnFlap(input.consumeTurnImpulse?.() ?? 0);
      if (input.steer * this.turnBank < 0) this.turnBank = 0; // klavyeyle ters yöne basınca
      this.turnBank *= Math.exp(-FLIGHT.bankDecay * dt);
      const targetRate = input.steer * FLIGHT.turnRate + this.turnBank;
      // Dönüşe girerken yumuşak, bırakırken/ters yöne geçerken hızlı.
      const easing = targetRate * this.yawRate < 0 || Math.abs(targetRate) < Math.abs(this.yawRate);
      const rate = easing ? FLIGHT.turnRelease : FLIGHT.turnSmoothing;
      this.yawRate += (targetRate - this.yawRate) * (1 - Math.exp(-rate * dt));
      this.yawRate = THREE.MathUtils.clamp(this.yawRate, -FLIGHT.turnRate * 1.3, FLIGHT.turnRate * 1.3);
      this.yaw -= this.yawRate * dt;
      this.forward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));

      root.position.addScaledVector(this.forward, FLIGHT.forwardSpeed * dt);
      root.position.y += this.vy * dt;

      // Tavan.
      if (root.position.y > FLIGHT.maxY) {
        root.position.y = FLIGHT.maxY;
        if (this.vy > 0) this.vy = 0;
      }
      // Zemin: yerin altına geçmesin. Çarpma kararını main.js verir.
      if (root.position.y < floorY + this.radius) root.position.y = floorY + this.radius;

      // Görsel: yön, yatış, burun açısı, kanatlar.
      root.rotation.y = this.yaw;
      const k = 1 - Math.exp(-6 * dt);
      this.bank += (-(this.yawRate / FLIGHT.turnRate) * 0.6 - this.bank) * k; // gerçek dönüşe göre yatar
      body.rotation.z = this.bank;
      body.rotation.x = THREE.MathUtils.clamp(this.vy * 0.05, -0.45, 0.45);

      this.flapAnim = Math.max(0, this.flapAnim - dt * 3);
      const idle = Math.sin(performance.now() * 0.002) * 0.05;
      const flapAngle = Math.sin(this.flapAnim * Math.PI * 2) * 0.9 * this.flapAnim + idle;
      for (const w of wings) w.pivot.rotation.z = w.side * flapAngle;
    },

    // Tek kol çırpışı: v > 0 sağa, v < 0 sola; büyüklüğü çırpış gücü.
    applyTurnFlap(v) {
      if (!v) return;
      const side = Math.sign(v);
      const kick = Math.abs(v) * FLIGHT.flapTurn;
      if (this.turnBank * side >= 0) {
        // Aynı yöne (ya da düzken): dönüşü artır.
        this.turnBank = THREE.MathUtils.clamp(this.turnBank + side * kick, -FLIGHT.maxBank, FLIGHT.maxBank);
      } else {
        // Ters yöne: mevcut dönüşü her zaman aşar ve öbür yöne de biraz kazandırır.
        this.turnBank = side * Math.max(kick * FLIGHT.reverseGain, kick - Math.abs(this.turnBank));
      }
    },

    // Oyun bittikten sonra: kuş takla atarak yere düşer.
    updateCrashed(dt, floorY = 0) {
      if (root.position.y <= floorY + this.radius) return;
      this.vy -= FLIGHT.gravity * dt;
      root.position.y = Math.max(floorY + this.radius, root.position.y + this.vy * dt);
      body.rotation.z += dt * 7;
      body.rotation.x += dt * 3;
    },
  };

  bird.reset();
  return bird;
}
