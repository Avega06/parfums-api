export interface ProductsResponse {
  products: Product[];
}

export interface Product {
  brand?: string;
  product: string;
  price?: string | any;
  product_link: string;
  image: string;
  type_parfum: TypeParfum;
  shop: Shop;
  sold_out?: SoldOut;
  volume?: string;
}

export enum Shop {
  ComprarEnChile = "Comprar en Chile",
  Cosmetic = "Cosmetic",
  MzPerfumes = "Mz Perfumes",
}

export enum SoldOut {
  SoldOut = "Sold out",
}

export enum TypeParfum {
  Edc = "EDC",
  Edp = "EDP",
  Edt = "EDT",
  Other = "Other",
}
