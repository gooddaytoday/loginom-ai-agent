import { Product } from "@loginom-ai-agent/product"

const wordmark = Product.wordmark.split(" ")

export const logo = {
  left: [wordmark[0] ?? ""],
  right: [wordmark[1] ?? ""],
}

export const wordmarkAccent = "#C79292"
export const wordmarkAccentAnsi = "\x1b[38;2;199;146;146m"

export const go = {
  left: ["    ", "█▀▀▀", "█_^█", "▀▀▀▀"],
  right: ["    ", "█▀▀█", "█__█", "▀▀▀▀"],
}

export const marks = "_^~,"
