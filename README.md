# Deurvisualisator — Simon Maree

Generatieve deurvisualisatie: klant uploadt een kamerfoto, kiest een deur en kleur, en ziet via `gpt-image-2` hoe die deur in de ruimte past.

## Starten

```bash
cp .env.example .env.local
# Zet OPENAI_API_KEY=sk-... in .env.local

npm install
npm run dev
```

Zonder API-key draait de app in **demo-modus** (geeft de kamerfoto terug i.p.v. een echte generatie).

## Flow

1. Montagetype kiezen  
2. Foto uploaden (HEIC/EXIF/resize)  
3. Catalogus (zoeken + collectiefilters)  
4. Kleur kiezen  
5. **Bekijk in mijn ruimte** → generatie (alleen op knopklik)  
6. Resultaat downloaden / delen (`simonmaree.nl` watermerk)

## Kostenremmen

- Geen auto-generatie bij bladeren  
- Cache op hash(foto + deur-id + kleur)  
- Max. 5 generaties per sessie, daarna e-mail  
- "Opnieuw proberen" telt niet mee  

## Producten toevoegen

Bewerk `src/data/producten.ts` — zie de commentaarregels bovenaan.
