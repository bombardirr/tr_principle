// Централизованные TypeScript типы и интерфейсы

// Базовые типы для работы с документами
export interface Document {
  id: string
  name: string
  content: string
}

// Типы для сегментов перевода
export interface Segment {
  id: string
  original: string
  translation: string
  status: 'new' | 'translated' | 'confirmed'
}

// Типы для Translation Memory
export interface TranslationMemory {
  id: string
  source: string
  target: string
  languagePair: string
}

