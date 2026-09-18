export function fraseConfermaPausaTimelineSync(label: string): string {
  const t = label.trim().toUpperCase() || "AZIENDA";
  return `DISATTIVO SINCRONIZZAZIONE ${t}`;
}
