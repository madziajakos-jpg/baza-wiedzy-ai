// Adres „furtki” (Cloudflare Worker) do generowania. Klucz OpenAI NIE jest tutaj – siedzi w sekrecie Workera.
export const API_URL = 'https://baza-wiedzy-ai.madziajakos.workers.dev';
export const api = () => localStorage.getItem('baza-api') || API_URL;
