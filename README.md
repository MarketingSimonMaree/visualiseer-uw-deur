# Deurvisualisator — Simon Maree

Generatieve deurvisualisatie: klant uploadt een kamerfoto, kiest een deur en kleur, en ziet via `gpt-image-2` hoe die deur in de ruimte past.

## Starten (lokaal)

```bash
cp .env.example .env.local
# Zet OPENAI_API_KEY=sk-... in .env.local

npm install
npm run dev
```

Zonder API-key draait de app in **demo-modus** (geeft de kamerfoto terug i.p.v. een echte generatie).

## Vercel (live)

1. Project koppelen aan deze repo (framework: Vite, output: `dist`)
2. **Environment Variable** zetten:
   - Name: `OPENAI_API_KEY`
   - Value: je OpenAI-sleutel
   - Environments: Production (en Preview)
3. Redeploy

De API staat in `api/generate.ts`. Zonder die key (of zonder die route) krijg je een 404/fout bij genereren.

## Flow

1. Huidige situatie (foto)  
2. Wat gaat hier gebeuren?  
3. Deur uitkiezen  
4. Kleur  
5. **Bekijk in uw ruimte** → generatie (alleen op knopklik)  
6. Resultaat downloaden / offerte  

## Kostenremmen

- Geen auto-generatie bij bladeren  
- Cache op hash(foto + deur-id + kleur)  
- Max. 5 generaties per sessie, daarna e-mail  
- Max. 20 generaties per dag (browser + server)  
- "Opnieuw proberen" telt niet mee voor de sessielimiet  

## Producten toevoegen

Bewerk `src/data/producten.ts` — zie de commentaarregels bovenaan.
