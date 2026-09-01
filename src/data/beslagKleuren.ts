/** Standaard afwerkingen voor deurbeslag (klantkeuze). */
export type BeslagKleurOptie = {
  id: string
  naam: string
  hex: string
  /** Korte Engelse omschrijving voor de image-prompt. */
  promptLabel: string
}

export const BESLAG_KLEUREN: BeslagKleurOptie[] = [
  {
    id: 'beslag-mat-zwart',
    naam: 'Mat zwart',
    hex: '#1a1a1a',
    promptLabel: 'matte black / powder-coated black metal',
  },
  {
    id: 'beslag-antraciet',
    naam: 'Antraciet',
    hex: '#2F3234',
    promptLabel: 'anthracite / dark grey metal',
  },
  {
    id: 'beslag-rvs',
    naam: 'RVS / zilver',
    hex: '#C0C0C0',
    promptLabel: 'brushed stainless steel / silver metal',
  },
  {
    id: 'beslag-chroom',
    naam: 'Chroom',
    hex: '#E8E8E8',
    promptLabel: 'polished chrome',
  },
  {
    id: 'beslag-messing',
    naam: 'Messing',
    hex: '#C5A46E',
    promptLabel: 'brushed brass / gold-toned metal',
  },
  {
    id: 'beslag-brons',
    naam: 'Brons',
    hex: '#8C6B3F',
    promptLabel: 'bronze / antique bronze metal',
  },
  {
    id: 'beslag-wit',
    naam: 'Wit',
    hex: '#F7F5EC',
    promptLabel: 'white painted / white powder-coated metal',
  },
]

export function beslagKleurPromptLabel(idOrNaam: string): string {
  const found = BESLAG_KLEUREN.find(
    (b) => b.id === idOrNaam || b.naam === idOrNaam,
  )
  return found?.promptLabel ?? idOrNaam
}
