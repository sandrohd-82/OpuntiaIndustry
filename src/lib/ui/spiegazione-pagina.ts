export function spiegazionePagina(title: string, subtitle?: string): string {
  const nome = title.trim() || "questa pagina";
  const extra = subtitle?.trim();
  if (!extra) {
    return `Sei nella pagina «${nome}». Qui fai il lavoro di questa sezione. Leggi i titoli e compila solo quello che vedi.`;
  }
  return `Sei nella pagina «${nome}». A cosa serve: ${extra}`;
}
