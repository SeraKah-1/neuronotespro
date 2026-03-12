# Neuro-Sidekick

Aplikasi pencatat medis berbasis Markdown yang lumayan kepake.

Gue bikin ini karena nulis catatan medis manual itu capek, dan kebanyakan tool AI di luar sana UI-nya kaku atau hasil generate-nya terlalu *generic*. Ini dibikin supaya lu bisa menstruktur, nulis, dan ngembangin materi medis tanpa banyak basa-basi.

## Fitur (Yang beneran jalan)

- **Markdown Editor**: Tinggal ngetik. Support markdown standar, tabel, dan LaTeX (buat rumus-rumus).
- **AI Engine (Gemini & Groq)**: Masukin API key lu, dan AI bakal bantu bikinin struktur, ngejabarin topik (Deepen), atau jawab pertanyaan. Prompt-nya udah di-tweak supaya output-nya padat dan nggak bertele-tele.
- **Mermaid Diagrams**: Ketik ` ```mermaid ` dan dia bakal ngerender flowchart otomatis. Kepake banget buat bikin *pathway* penyakit atau algoritma klinis.
- **Sticky Notes**: Panel samping buat coret-coretan. Support markdown juga, dan bisa di-collapse biar layar lu nggak sumpek.
- **Context-Aware Assistant**: Lu bisa nanya ke AI berdasarkan catatan yang lagi lu tulis. Atau klik icon bot di sticky note buat minta penjelasan.
- **Local Storage**: Semuanya disimpen di `localStorage` browser. Nggak ada database, nggak perlu login. Data lu aman di laptop lu sendiri.

## Cara Jalanin

1. Clone repo ini.
2. `npm install`
3. `npm run dev`
4. Buka `localhost:3000`.

Lu butuh API key buat make fitur AI-nya. Ambil key dari Google AI Studio (Gemini) atau Groq Console, terus masukin di menu Settings di dalem app. Key-nya cuma disimpen di browser lu, nggak dikirim ke server antah berantah.

## Tech Stack

- React (Vite)
- Tailwind CSS (buat styling, standar lah)
- `react-markdown` (plus plugin GFM, Math, dan Katex)
- `mermaid` (buat diagram)
- `lucide-react` (icon)

## Catatan buat yang mau ngoprek

- Prompt AI-nya sengaja dibikin *strict* (kaku) biar outputnya rapi. Kalau lu mau AI-nya lebih santai, lu bisa ubah *System Prompt* di `services/geminiService.ts` atau lewat setting "AI Personality" di UI.
- Rendering Mermaid-nya agak diakalin dikit biar UI nggak nge-freeze pas ngerender diagram yang kompleks.
- State buat Sticky Notes cuma array JSON biasa yang dilempar ke local storage.

Silakan di-fork, dioprek, atau dipake buat nugas. *Do whatever you want with it.*
