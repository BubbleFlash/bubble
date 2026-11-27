import type { Request, Response } from "express";
import { mongo } from "mongoose";
import { GameCatalog } from "../models/GameCatalog.js";
import { conflict } from "../utils/errors.js";
import type { GameLink, GameLinkInput } from "@commune/shared";

const catalogId = "games";
const maxCustomGames = 100;
const starterGames: GameLink[] = [
  { name: "Гости", url: "https://ghosty-web.com.ru/", logoUrl: "/ghosty-game.webp" },
  {
    name: "Bubble-chan murble game",
    url: "https://neucorochen.github.io/bubbletianbubblegame/",
    logoUrl: "/bubble-chan-game.png",
  },
];

export async function list(_req: Request, res: Response) {
  const catalog = await GameCatalog.findById(catalogId).lean();
  res.set("Cache-Control", "no-store").json({ items: [...starterGames, ...(catalog?.items ?? [])] });
}

export async function add(req: Request, res: Response) {
  const input: GameLinkInput = req.body;
  const game: GameLink = { ...input, logoUrl: input.logoUrl ?? null };
  if (starterGames.some(({ url }) => url === game.url)) {
    throw conflict("Эта ссылка уже есть в каталоге.");
  }

  // Match both constraints in the write so concurrent requests cannot bypass them.
  const filter = {
    _id: catalogId,
    "items.url": { $ne: game.url },
    [`items.${maxCustomGames - 1}`]: { $exists: false },
  };
  const update = { $push: { items: game } };
  try {
    await GameCatalog.updateOne(filter, update, { upsert: true, runValidators: true });
  } catch (error) {
    if (!(error instanceof mongo.MongoServerError) || error.code !== 11000) throw error;
    // Two different games can race to create the singleton on an empty database.
    const result = await GameCatalog.updateOne(filter, update, { runValidators: true });
    if (!result.modifiedCount) {
      const catalog = await GameCatalog.findById(catalogId).lean();
      if (catalog?.items.some(({ url }) => url === game.url)) {
        throw conflict("Эта ссылка уже есть в каталоге.");
      }
      throw conflict("Достигнут лимит игр в каталоге.");
    }
  }
  res.status(201).json(game);
}
