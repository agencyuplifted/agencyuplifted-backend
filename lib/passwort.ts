import bcrypt from "bcryptjs";

export async function hashePasswort(klartext: string): Promise<string> {
  return bcrypt.hash(klartext, 10);
}

export async function pruefePasswort(klartext: string, hash: string): Promise<boolean> {
  return bcrypt.compare(klartext, hash);
}
