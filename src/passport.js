export const STAMPS = [
  { id: 'mithai', icon: '🍬', name: 'Mithai Mahal' },
  { id: 'jalebi', icon: '🥨', name: 'Hot Jalebi' },
  { id: 'panipuri', icon: '🥟', name: 'Golgappa Challenge' },
  { id: 'kulfi', icon: '🍦', name: 'Kulfi Corner' },
  { id: 'diya', icon: '🪔', name: 'Light a Diya' },
  { id: 'kandeel', icon: '🏮', name: 'Kandeel Carrier' },
  { id: 'bangles', icon: '💍', name: 'Choodi Shopping' },
  { id: 'balloon', icon: '🎈', name: 'Balloon Buddy' },
  { id: 'shoot', icon: '🎯', name: 'Gubbara Phod' },
  { id: 'rings', icon: '⭕', name: 'Ring Toss' },
  { id: 'cans', icon: '🥫', name: 'Dabba Maar' },
  { id: 'striker', icon: '🔔', name: 'Strongman Bell' },
  { id: 'wheel', icon: '🎡', name: 'Giant Wheel' },
  { id: 'carousel', icon: '🎠', name: 'Carousel Ride' },
  { id: 'aarti', icon: '🛕', name: 'Temple Aarti' },
  { id: 'float', icon: '🌊', name: 'Diya on the River' },
  { id: 'lantern', icon: '🌟', name: 'Wish Lantern' },
  { id: 'greet', icon: '🙏', name: 'Happy Diwali Greeting' },
  { id: 'crackers', icon: '🎇', name: 'Light a Cracker' },
  { id: 'show', icon: '🎆', name: 'Grand Show' },
  { id: 'ramayan', icon: '📽️', name: 'Ramleela Show' },
  { id: 'drive', icon: '🚗', name: 'Chakri Cars' },
  { id: 'fly', icon: '✈️', name: 'Pushpak Viman' },
  { id: 'poster', icon: '📸', name: 'Selfie Point' },
  { id: 'boat', icon: '🛶', name: 'Naav ki Sair' },
  { id: 'train', icon: '🚂', name: 'Toy Train' },
  { id: 'columbus', icon: '🚢', name: 'Columbus Swing' },
  { id: 'tambola', icon: '🎟️', name: 'Tambola' },
  { id: 'kuan', icon: '🏍️', name: 'Maut ka Kuan' },
  { id: 'ravan', icon: '🔥', name: 'Ravan Dahan' },
  { id: 'creator', icon: '🤝', name: 'Met a Creator' },
];

const KEY = 'melaPassport';

/** The mela passport: one stamp per experience, kept in this browser. */
export class Passport {
  constructor(ui, audio) {
    this.ui = ui;
    this.audio = audio;
    this.done = new Set();
    try {
      JSON.parse(localStorage.getItem(KEY) || '[]').forEach((id) => this.done.add(id));
    } catch {
      // storage unavailable: the passport just won't persist
    }
  }

  has(id) {
    return this.done.has(id);
  }

  stamp(id) {
    if (this.done.has(id)) return false;
    const s = STAMPS.find((x) => x.id === id);
    if (!s) return false;
    this.done.add(id);
    try {
      localStorage.setItem(KEY, JSON.stringify([...this.done]));
    } catch {
      // ignore
    }
    const n = this.done.size;
    this.ui.stampToast(s, n, STAMPS.length);
    this.audio.ding(0.12);
    if (n === STAMPS.length) setTimeout(() => this.ui.toast('🏆 Passport complete! You have done everything at the mela!', 5000), 2500);
    return true;
  }
}
