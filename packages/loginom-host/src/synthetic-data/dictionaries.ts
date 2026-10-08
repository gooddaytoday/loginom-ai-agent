const male = {
  surnames: ["Иванов", "Петров", "Смирнов", "Кузнецов", "Попов", "Соколов", "Лебедев", "Козлов", "Новиков", "Морозов"],
  names: ["Александр", "Дмитрий", "Сергей", "Андрей", "Михаил", "Иван", "Артём", "Николай", "Павел", "Егор"],
  patronymics: ["Александрович", "Дмитриевич", "Сергеевич", "Андреевич", "Михайлович", "Иванович", "Николаевич", "Павлович"],
}

const female = {
  surnames: ["Иванова", "Петрова", "Смирнова", "Кузнецова", "Попова", "Соколова", "Лебедева", "Козлова", "Новикова", "Морозова"],
  names: ["Анна", "Мария", "Елена", "Ольга", "Наталья", "Ирина", "Светлана", "Татьяна", "Екатерина", "Юлия"],
  patronymics: ["Александровна", "Дмитриевна", "Сергеевна", "Андреевна", "Михайловна", "Ивановна", "Николаевна", "Павловна"],
}

export const cities = ["Москва", "Санкт-Петербург", "Казань", "Новосибирск", "Екатеринбург", "Нижний Новгород", "Самара", "Краснодар", "Воронеж", "Пермь", "Уфа", "Ростов-на-Дону"]

export const products = ["Молоко", "Хлеб", "Сыр", "Яблоки", "Масло", "Кефир", "Сахар", "Рис", "Гречка", "Чай", "Кофе", "Макароны", "Курица", "Картофель", "Морковь", "Яйца", "Сметана", "Творог", "Сок", "Вода"]

export const organizations = ["ООО «Рассвет»", "АО «Север»", "ООО «Логистика Плюс»", "ИП Орлов", "ООО «Городской склад»", "АО «Торгснаб»", "ООО «Поле»", "ООО «Вектор»"]

const sentences = [
  "Поставка задержана на складе.",
  "Накладная оформлена частично.",
  "Количество сходится с остатком.",
  "Требуется повторный пересчёт.",
  "Партия принята без замечаний.",
]

export function personName(pick: <T>(values: readonly T[]) => T) {
  const gender = pick([male, female])
  return `${pick(gender.surnames)} ${pick(gender.names)} ${pick(gender.patronymics)}`
}

export function dictionaryValue(name: "fio" | "cities" | "products" | "organizations" | "text", pick: <T>(values: readonly T[]) => T, index: number) {
  if (name === "fio") return personName(pick)
  if (name === "cities") return cycle(cities, pick, index)
  if (name === "products") return cycle(products, pick, index)
  if (name === "organizations") return cycle(organizations, pick, index)
  return pick(sentences)
}

function cycle(values: readonly string[], pick: <T>(values: readonly T[]) => T, index: number) {
  const value = values[index % values.length] ?? pick(values)
  if (index < values.length) return value
  return `${value} ${Math.floor(index / values.length) + 1}`
}
