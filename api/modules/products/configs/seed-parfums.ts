import { db } from "../../../db"; // Tu instancia de cliente Turso / Drizzle
import {
  parfumTable,
  fragranticaMetadataTable,
  notesTable,
  fragranticaNotesTable,
} from "../../../db/schema";
import { eq } from "drizzle-orm";

// 1. Tipo de datos de entrada basado en tu estructura JSON
export type ParfumInput = {
  parfum_id?: string;
  name: string;
  brand_id: string;
  volume: string;
  type_id: string | number;
  confidence?: string;
  fragrantica: {
    id: number;
    brand: string;
    name: string;
    year: number;
    gender: string;
    longevity: {
      average: number;
      histogram: { bucket: number; count: number }[];
    };
    sillage: {
      average: number;
      histogram: { bucket: number; count: number }[];
    };
    notes: {
      tiered: {
        top: { name: string; name_es?: string; image_id?: number }[];
        middle: { name: string; name_es?: string; image_id?: number }[];
        base: { name: string; name_es?: string; image_id?: number }[];
      };
      flat: { name: string; name_es?: string; image_id?: number }[];
    };
  };
};

/**
  Función principal para insertar o actualizar un perfume completo
 */
export async function upsertParfum(data: ParfumInput) {
  return await db.transaction(async (tx) => {
    const f = data.fragrantica;

    // A. UPSERT: Metadata de Fragrantica
    await tx
      .insert(fragranticaMetadataTable)
      .values({
        fragranticaId: f.id,
        brand: f.brand,
        name: f.name,
        year: f.year,
        gender: f.gender,
        longevityAverage: f.longevity.average,
        longevityHistogram: f.longevity.histogram,
        sillageAverage: f.sillage.average,
        sillageHistogram: f.sillage.histogram,
      })
      .onConflictDoUpdate({
        target: fragranticaMetadataTable.fragranticaId,
        set: {
          brand: f.brand,
          name: f.name,
          year: f.year,
          gender: f.gender,
          longevityAverage: f.longevity.average,
          longevityHistogram: f.longevity.histogram,
          sillageAverage: f.sillage.average,
          sillageHistogram: f.sillage.histogram,
        },
      });

    // B. HELPER: Obtener o crear una nota (evita duplicar la misma nota en la BD)
    async function getOrCreateNoteId(note: {
      name: string;
      name_es?: string;
      image_id?: number;
    }) {
      const existingNote = await tx
        .select()
        .from(notesTable)
        .where(eq(notesTable.name, note.name))
        .get();

      if (existingNote) {
        // Si existe, actualizamos la traducción o la imagen si vienen datos nuevos
        if (note.name_es || note.image_id) {
          await tx
            .update(notesTable)
            .set({
              nameEs: note.name_es ?? existingNote.nameEs,
              imageId: note.image_id ?? existingNote.imageId,
            })
            .where(eq(notesTable.noteId, existingNote.noteId));
        }
        return existingNote.noteId;
      }

      const [inserted] = await tx
        .insert(notesTable)
        .values({
          name: note.name,
          nameEs: note.name_es,
          imageId: note.image_id,
        })
        .returning({ noteId: notesTable.noteId });

      return inserted.noteId;
    }

    // C. Procesar y asociar Notas por pirámide (top, middle, base, flat)
    // 1. Limpiamos las asociaciones anteriores de este fragrantica_id
    await tx
      .delete(fragranticaNotesTable)
      .where(eq(fragranticaNotesTable.fragranticaId, f.id));

    // 2. Insertamos las relaciones actualizadas
    const tiers = [
      { list: f.notes.tiered.top, tier: "top" as const },
      { list: f.notes.tiered.middle, tier: "middle" as const },
      { list: f.notes.tiered.base, tier: "base" as const },
      { list: f.notes.flat, tier: "flat" as const },
    ];

    for (const { list, tier } of tiers) {
      if (!list) continue;
      for (const noteData of list) {
        const noteId = await getOrCreateNoteId(noteData);
        await tx.insert(fragranticaNotesTable).values({
          fragranticaId: f.id,
          noteId,
          tier,
        });
      }
    }

    // D. UPSERT: Perfume Principal (por Nombre único o por ID)
    await tx
      .insert(parfumTable)
      .values({
        ...(data.parfum_id ? { parfumId: data.parfum_id } : {}),
        name: data.name,
        brand: data.brand_id,
        volume: data.volume,
        typeId: Number(data.type_id),
        fragranticaId: f.id,
        confidence: data.confidence ?? "low",
      })
      .onConflictDoUpdate({
        target: parfumTable.name, // conflicto por nombre de perfume
        set: {
          brand: data.brand_id,
          volume: data.volume,
          typeId: Number(data.type_id),
          fragranticaId: f.id,
          confidence: data.confidence ?? "low",
        },
      });
  });
}
