import { jsPDF } from "jspdf";
import { domToPng } from "modern-screenshot";

/** Foto della scheda già a video, messa su A4. Non ridisegna il preventivo. */
export async function foglioPreventivoToPdfBase64(node: HTMLElement): Promise<string> {
  const dataUrl = await domToPng(node, {
    scale: 2,
    backgroundColor: "#ffffff",
  });
  const pdf = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const props = pdf.getImageProperties(dataUrl);
  const pageW = 210;
  const pageH = 297;
  const imgH = (props.height * pageW) / props.width;
  let restante = imgH;
  let y = 0;
  pdf.addImage(dataUrl, "PNG", 0, y, pageW, imgH, undefined, "FAST");
  restante -= pageH;
  while (restante > 2) {
    y = restante - imgH;
    pdf.addPage();
    pdf.addImage(dataUrl, "PNG", 0, y, pageW, imgH, undefined, "FAST");
    restante -= pageH;
  }
  const uri = pdf.output("datauristring");
  const comma = uri.indexOf(",");
  return comma >= 0 ? uri.slice(comma + 1) : uri;
}
