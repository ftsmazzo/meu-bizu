/** Prepara a foto da folha: reduz e converte para JPEG antes de mandar, para ser rápida e leve. */

const LADO_MAXIMO = 2000;
const QUALIDADE = 0.85;

export interface FotoPreparada {
  imagem: string; // base64, sem o prefixo `data:`
  tipo: "image/jpeg";
}

export async function prepararFoto(arquivo: File): Promise<FotoPreparada> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(arquivo); // respeita a rotação que o celular gravou
  } catch {
    throw new Error("Não consegui abrir essa imagem. Tente uma foto em JPEG ou PNG.");
  }
  const escala = Math.min(1, LADO_MAXIMO / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * escala);
  canvas.height = Math.round(bitmap.height * escala);
  const contexto = canvas.getContext("2d");
  if (!contexto) throw new Error("Seu navegador não conseguiu preparar a foto.");
  contexto.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const url = canvas.toDataURL("image/jpeg", QUALIDADE);
  return { imagem: url.slice(url.indexOf(",") + 1), tipo: "image/jpeg" };
}
