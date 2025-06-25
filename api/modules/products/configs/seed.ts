import { parfumBrandsTable, shopTable } from "api/db/schema";
import { db } from "api/db/index";

export interface Brand {
  name: string;
}

export interface Shop {
  name: string;
  address?: string;
}

const brands: Brand[] = [
  { name: "Armaf" },
  { name: "Mancera" },
  { name: "Victoria's Secret" },
  { name: "Creed" },
  { name: "Ted Lapidus" },
  { name: "Xerjoff" },
  { name: "Naseem" },
  { name: "Lancome" },
  { name: "Beyonce" },
  { name: "Revlon" },
  { name: "Agua brava" },
  { name: "Adolfo Domínguez" },
  { name: "Victoria´s Secret" },
  { name: "Prada" },
  { name: "Lamborghini" },
  { name: "Oscar de la Renta" },
  { name: "Rihanna" },
  { name: "Devsana" },
  { name: "Mossimo" },
  { name: "Disney" },
  { name: "Asten" },
  { name: "Atralia" },
  { name: "Ferrari" },
  { name: "Kim Kardashian" },
  { name: "Prive Zarah" },
  { name: "Victorinox" },
  { name: "Keneth Cole" },
  { name: "Michael Kors" },
  { name: "Boucheron" },
  { name: "Swiss Arabian" },
  { name: "Philipp Plein" },
  { name: "Hummer" },
  { name: "Halston" },
  { name: "Aramis" },
  { name: "Aquolina" },
  { name: "Perry Ellis" },
  { name: "Franck Olivier" },
  { name: "Ministry of Oud" },
  { name: "Marc Jacobs" },
  { name: "Grès" },
];

const shops: Shop[] = [
  {
    name: "Mz Perfumes",
    address: "Valdivia 485, Galería Colón local 15 Los Ángeles",
  },
  {
    name: "Comprar en chile",
    address: "Av. Libertador Bernardo OHiggins 980, Local 103 ",
  },
  {
    name: "Cosmetic",
  },
];

export const seed = async () => {
  await Promise.all([brandsSeed(), shopSeed()]);
};

const brandsSeed = async () => {
  await db.insert(parfumBrandsTable).values(brands).onConflictDoNothing();
};

const shopSeed = async () => {
  await db.insert(shopTable).values(shops).onConflictDoNothing();
};
