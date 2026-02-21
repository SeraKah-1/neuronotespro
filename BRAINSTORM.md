# Brainstorming & Roadmap: NeuroNote V2

Based on the new database schema and realtime capabilities, here is a roadmap for future development.

## 1. Cloud-Native Folder System
**Current State:** Folders are stored in `localStorage` (`neuro_folders`), while notes have a `folder_id` column in Supabase.
**Problem:** If a user clears their browser cache, they lose their folder structure, even if the notes persist in the cloud.
**Proposal:**
- Create a `folders` table in Supabase:
  ```sql
  create table public.folders (
    id text primary key,
    name text not null,
    parent_id text references public.folders(id),
    user_id uuid default auth.uid(),
    created_at bigint default (extract(epoch from now()) * 1000)
  );
  ```
- Migrate `StorageService` to sync folders just like notes.

## 2. Collaborative "Multiplayer" Mode
**Current State:** Realtime is enabled, but the UI just refreshes the list.
**Proposal:**
- **Presence Indicators:** Show who is currently viewing/editing a note using Supabase Presence.
- **Field Locking:** If User A is editing the `content`, lock it for User B to prevent overwrites.
- **Live Cursors:** For the Canvas view, show live cursors of other users.

## 3. Vector Search & "Chat with Library"
**Current State:** `library_materials` has `processed_content` (text).
**Proposal:**
- Enable `pgvector` extension on Supabase.
- Add an `embedding` column to `library_materials`.
- When uploading a PDF/Text, generate an embedding using Gemini/Groq.
- Implement "Semantic Search" in the Knowledge Base (e.g., "Find papers about dopamine receptors" -> returns relevant PDFs even if the exact keyword isn't there).

## 4. Tag Management System
**Current State:** Tags are ad-hoc text arrays.
**Proposal:**
- Create a `tags` table to standardize tags (e.g., "Cardiology" is always red).
- **Tag Analytics:** Show which topics are most studied.
- **Auto-Tagging:** Use Gemini to suggest tags based on note content.

## 5. Version History (Time Travel)
**Current State:** Only `updated_at` is tracked.
**Proposal:**
- Create a `note_versions` table.
- Trigger: On every `UPDATE` to `neuro_notes`, save the *old* content to `note_versions`.
- UI: Add a "History" button to restore previous versions.

## 6. Public Publishing
**Current State:** RLS is "God Mode" (All Access).
**Proposal:**
- Add `is_public` (boolean) to `neuro_notes`.
- Update RLS:
  - `SELECT`: Allow if `auth.uid() == user_id` OR `is_public == true`.
  - `INSERT/UPDATE/DELETE`: Allow only if `auth.uid() == user_id`.
- Generate public "Share Links" for notes.

## 7. Study Mode & Spaced Repetition
**Current State:** Notes are static text.
**Proposal:**
- Convert notes into Flashcards automatically.
- Store "Next Review Date" in the database based on an algorithm (SM-2 or FSRS).
- Add a `review_logs` table to track performance.
