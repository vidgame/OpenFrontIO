import fs from "fs/promises";
import path from "path";
import { logger } from "./Logger";

const filePath = path.join(process.cwd(), "data", "friends.json");

export async function readFriends(): Promise<string[]> {
  try {
    const data = await fs.readFile(filePath, "utf-8");
    return JSON.parse(data);
  } catch (err: any) {
    if (err.code === "ENOENT") {
      return [];
    }
    logger.error(`Failed to read friends: ${err}`);
    return [];
  }
}

export async function addFriend(name: string): Promise<void> {
  const friends = await readFriends();
  if (!friends.includes(name)) {
    friends.push(name);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(friends, null, 2));
  }
}
