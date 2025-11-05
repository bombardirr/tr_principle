<template>
  <div id="app">
    <div class="header">
      <h1>Translation Tool</h1>
      <div class="controls">
        <input 
          type="file" 
          ref="fileInput" 
          @change="handleFileUpload" 
          accept=".docx,.doc"
          style="display: none;"
        />
        <button @click="openFileDialog" class="upload-btn">
          📁 Загрузить Word документ
        </button>
        <button @click="exportDocument" class="export-btn" v-if="sentences.length > 0">
          💾 Экспорт Word
        </button>
        <button @click="clearDocument" class="clear-btn" v-if="sentences.length > 0">
          🗑️ Очистить
        </button>
      </div>
    </div>
    
    <div class="container" v-if="sentences.length > 0">
      <!-- Общие заголовки -->
      <div class="headers">
        <h3 class="header-left">Исходный текст</h3>
        <h3 class="header-right">Перевод</h3>
      </div>
      
      <!-- Единая область скролла -->
      <div class="scroll-container" ref="scrollContainer">
        <div class="sentences-content">
          <div 
            v-for="(sentence, index) in sentences" 
            :key="index" 
            class="sentence-row"
          >
            <div class="sentence-item left-item">
              <span class="sentence-number">{{ index + 1 }}.</span>
              <span class="sentence-text">{{ sentence }}</span>
            </div>
            
            <div class="sentence-item right-item">
              <span class="sentence-number">{{ index + 1 }}.</span>
              <textarea 
                v-model="translations[index]"
                class="sentence-textarea"
                :placeholder="sentence"
              ></textarea>
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <div class="empty-state" v-else>
      <div class="empty-content">
        <h2>Добро пожаловать в Translation Tool</h2>
        <p>Загрузите Word документ (.docx) для начала работы</p>
        <button @click="openFileDialog" class="upload-btn large">
          📁 Выбрать файл
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { saveAs } from 'file-saver'
import PizZip from 'pizzip'

// Типы данных для карты сегментов (как в Trados)
interface XmlTextElement {
  element: Element  // XML элемент <w:t>
  text: string      // Текст элемента
  index: number     // Порядковый номер элемента в документе
}

interface SegmentMap {
  segmentText: string        // Текст сегмента (предложения)
  xmlElements: XmlTextElement[]  // Список XML элементов, составляющих этот сегмент
  startIndex: number        // Индекс первого элемента
  endIndex: number          // Индекс последнего элемента
}

const fileInput = ref<HTMLInputElement | null>(null)
const scrollContainer = ref<HTMLDivElement | null>(null)
const sentences = ref<string[]>([])
const translations = ref<string[]>([])
const defaultFolder = ref<string>('')
const originalFile = ref<File | null>(null)
const originalArrayBuffer = ref<ArrayBuffer | null>(null)
const segmentXmlMap = ref<SegmentMap[]>([])  // Карта соответствия сегментов и XML элементов
const originalDocumentXml = ref<string>('')  // Сохраненный оригинальный XML документа

// Открыть диалог выбора файла
const openFileDialog = () => {
  if (fileInput.value) {
    fileInput.value.click()
  }
}

// Обработка загрузки файла с парсингом XML (как в Trados)
const handleFileUpload = async (event: Event) => {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  
  if (!file) return
  
  try {
    // Сохраняем исходный файл для экспорта
    originalFile.value = file
    
    // Читаем файл как ArrayBuffer
    const arrayBuffer = await file.arrayBuffer()
    originalArrayBuffer.value = arrayBuffer
    
    // Загружаем документ как ZIP архив
    const zip = new PizZip(arrayBuffer)
    
    // Получаем XML содержимое документа
    const documentXml = zip.file('word/document.xml')?.asText()
    if (!documentXml) {
      throw new Error('Не удалось найти word/document.xml в документе')
    }
    
    // Сохраняем оригинальный XML
    originalDocumentXml.value = documentXml
    
    console.log('Парсим XML документ...')
    
    // Парсим XML и извлекаем сегменты с позициями (как в Trados)
    const { segments, xmlMap } = parseDocumentXml(documentXml)
    
    sentences.value = segments
    translations.value = new Array(segments.length).fill('')
    segmentXmlMap.value = xmlMap
    
    // Сохраняем папку по умолчанию (только имя файла для браузера)
    const fileName = file.name
    console.log(`Загружен файл: ${fileName}`)
    
    console.log(`Загружено ${segments.length} сегментов`)
    console.log('Карта XML элементов создана:', xmlMap.length, 'сегментов с привязкой к XML')
    
  } catch (error) {
    console.error('Ошибка при загрузке файла:', error)
    alert('Ошибка при загрузке файла. Убедитесь, что файл является корректным Word документом.')
  }
}

// Парсинг XML документа с созданием карты сегментов (как в Trados)
const parseDocumentXml = (xml: string): { segments: string[], xmlMap: SegmentMap[] } => {
  // Парсим XML
  const parser = new DOMParser()
  const xmlDoc = parser.parseFromString(xml, 'text/xml')
  
  // Проверяем на ошибки парсинга
  const parseError = xmlDoc.querySelector('parsererror')
  if (parseError) {
    throw new Error(`Ошибка парсинга XML: ${parseError.textContent}`)
  }
  
  // Находим все элементы <w:t> (текстовые элементы Word)
  const textElements = xmlDoc.getElementsByTagName('w:t')
  
  console.log(`Найдено ${textElements.length} текстовых элементов`)
  
  // Собираем все текстовые элементы с их содержимым
  const xmlTextElements: XmlTextElement[] = []
  
  for (let i = 0; i < textElements.length; i++) {
    const element = textElements[i] as Element
    const text = (element.textContent || '').trim()
    
    if (text) {  // Игнорируем пустые элементы
      xmlTextElements.push({
        element: element,
        text: text,
        index: i
      })
    }
  }
  
  // Собираем полный текст из всех элементов для разбиения на сегменты
  const fullText = xmlTextElements.map(el => el.text).join(' ')
  
  // Разбиваем на сегменты (предложения)
  const segments = splitIntoSentences(fullText)
  
  // Создаем карту соответствия сегментов и XML элементов
  const xmlMap: SegmentMap[] = []
  
  let currentXmlIndex = 0
  
  segments.forEach(segment => {
    const segmentWords = segment.split(/\s+/).filter(w => w.length > 0)
    const segmentElements: XmlTextElement[] = []
    
    // Находим XML элементы, которые соответствуют этому сегменту
    let segmentText = ''
    let foundWords = 0
    const startIndex = currentXmlIndex
    
    // Собираем элементы, пока не соберем все слова сегмента
    for (let i = currentXmlIndex; i < xmlTextElements.length && foundWords < segmentWords.length; i++) {
      const xmlEl = xmlTextElements[i]
      const xmlWords = xmlEl.text.split(/\s+/).filter(w => w.length > 0)
      
      // Проверяем, есть ли слова сегмента в этом XML элементе
      let wordFound = false
      for (const word of xmlWords) {
        if (foundWords < segmentWords.length && 
            (word === segmentWords[foundWords] || 
             word.toLowerCase() === segmentWords[foundWords].toLowerCase())) {
          if (!segmentElements.includes(xmlEl)) {
            segmentElements.push(xmlEl)
            segmentText += (segmentText ? ' ' : '') + xmlEl.text
          }
          foundWords++
          wordFound = true
          
          // Если нашли все слова, выходим
          if (foundWords >= segmentWords.length) {
            currentXmlIndex = i + 1
            break
          }
        }
      }
      
      // Если слово найдено, продолжаем искать дальше
      if (wordFound && foundWords < segmentWords.length) {
        continue
      }
      
      // Если не нашли точное соответствие, пробуем добавить элемент если он еще не добавлен
      if (!wordFound && segmentElements.length === 0 && segmentWords.length > 0) {
        // Проверяем, содержит ли элемент хотя бы часть сегмента
        const segmentFirstWord = segmentWords[0]
        if (xmlWords.some(w => w === segmentFirstWord || w.toLowerCase() === segmentFirstWord.toLowerCase())) {
          segmentElements.push(xmlEl)
          segmentText = xmlEl.text
          foundWords = 1
          currentXmlIndex = i + 1
        }
      }
    }
    
    // Если все еще не нашли элементы, используем следующий доступный
    if (segmentElements.length === 0 && currentXmlIndex < xmlTextElements.length) {
      const nextEl = xmlTextElements[currentXmlIndex]
      segmentElements.push(nextEl)
      segmentText = nextEl.text
      currentXmlIndex++
    }
    
    // Сохраняем карту
    if (segmentElements.length > 0) {
      xmlMap.push({
        segmentText: segment,
        xmlElements: segmentElements,
        startIndex: segmentElements[0].index,
        endIndex: segmentElements[segmentElements.length - 1].index
      })
    }
  })
  
  return { segments, xmlMap }
}

// Разбиение текста на предложения
const splitIntoSentences = (text: string): string[] => {
  if (!text.trim()) return []
  
  // Разбиение по знакам препинания с сохранением разделителей
  const sentences: string[] = []
  let currentSentence = ''
  
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    currentSentence += char
    
    // Проверяем конец предложения
    if (/[.!?]/.test(char)) {
      const trimmed = currentSentence.trim()
      if (trimmed.length > 0) {
        sentences.push(trimmed)
        currentSentence = ''
      }
    }
  }
  
  // Добавляем последнее предложение, если оно есть
  const trimmed = currentSentence.trim()
  if (trimmed.length > 0 && !sentences.includes(trimmed)) {
    sentences.push(trimmed)
  }
  
  // Если предложений мало, разбиваем по запятым
  if (sentences.length < 3 && sentences.length > 0) {
    const allText = sentences.join(' ')
    const commaSplit = allText
      .split(/[,;]+/)
      .map(s => s.trim())
      .filter(s => s.length > 0)
    
    if (commaSplit.length > sentences.length) {
      return commaSplit
    }
  }
  
  return sentences.length > 0 ? sentences : [text]
}

// Экспорт документа с использованием карты сегментов (как в Trados)
const exportDocument = async () => {
  if (!originalFile.value || !originalArrayBuffer.value || sentences.value.length === 0) {
    alert('Нет документа для экспорта')
    return
  }
  
  if (segmentXmlMap.value.length === 0) {
    alert('Карта XML элементов не найдена. Перезагрузите документ.')
    return
  }
  
  try {
    console.log('Начинаем экспорт с использованием карты XML элементов (как в Trados)...')
    
    // Проверяем, есть ли переводы
    const hasTranslations = translations.value.some(translation => translation.trim() !== '')
    if (!hasTranslations) {
      const confirmExport = confirm('Вы не внесли переводы. Экспортировать исходный документ?')
      if (!confirmExport) return
    }
    
    // Загружаем исходный документ как ZIP архив
    const zip = new PizZip(originalArrayBuffer.value)
    
    // Получаем XML содержимое документа
    const documentXml = zip.file('word/document.xml')?.asText()
    if (!documentXml) {
      throw new Error('Не удалось найти word/document.xml в документе')
    }
    
    console.log('Исходный XML длина:', documentXml.length)
    
    // Парсим XML для работы с элементами (как в Trados)
    const parser = new DOMParser()
    const xmlDoc = parser.parseFromString(documentXml, 'text/xml')
    
    // Проверяем на ошибки парсинга
    const parseError = xmlDoc.querySelector('parsererror')
    if (parseError) {
      throw new Error(`Ошибка парсинга XML: ${parseError.textContent}`)
    }
    
    // Получаем все элементы <w:t>
    const textElements = xmlDoc.getElementsByTagName('w:t')
    console.log(`Найдено ${textElements.length} текстовых элементов`)
    
    let replacementsCount = 0
    
    // Используем карту для точной замены (как в Trados)
    segmentXmlMap.value.forEach((segmentMap, index) => {
      const translation = translations.value[index]?.trim()
      
      // Если есть перевод, заменяем текст в связанных XML элементах
      if (translation && translation !== segmentMap.segmentText) {
        console.log(`Замена сегмента ${index + 1}: "${segmentMap.segmentText}" -> "${translation}"`)
        
        // Если сегмент связан с одним XML элементом
        if (segmentMap.xmlElements.length === 1) {
          const xmlEl = segmentMap.xmlElements[0]
          
          // Находим соответствующий элемент в XML документе по индексу
          if (xmlEl.index >= 0 && xmlEl.index < textElements.length) {
            const targetElement = textElements[xmlEl.index] as Element
            
            // Заменяем текст в элементе, сохраняя структуру
            targetElement.textContent = translation
            replacementsCount++
            
            console.log(`✓ Замена в элементе ${xmlEl.index}: "${xmlEl.text}" -> "${translation}"`)
          }
        } 
        // Если сегмент связан с несколькими XML элементами
        else if (segmentMap.xmlElements.length > 1) {
          // Заменяем текст в первом элементе, остальные очищаем
          const firstElementIndex = segmentMap.xmlElements[0].index
          
          if (firstElementIndex >= 0 && firstElementIndex < textElements.length) {
            const firstElement = textElements[firstElementIndex] as Element
            firstElement.textContent = translation
            
            // Очищаем остальные элементы, связанные с этим сегментом
            for (let i = 1; i < segmentMap.xmlElements.length; i++) {
              const elementIndex = segmentMap.xmlElements[i].index
              if (elementIndex >= 0 && elementIndex < textElements.length) {
                const element = textElements[elementIndex] as Element
                element.textContent = ''
              }
            }
            
            replacementsCount++
            console.log(`✓ Замена в нескольких элементах (${segmentMap.xmlElements.length}) для сегмента ${index + 1}`)
          }
        }
      }
    })
    
    console.log(`Всего замен: ${replacementsCount}`)
    
    // Отладочная информация
    if (replacementsCount === 0) {
      console.warn('⚠️ Никаких замен не было выполнено!')
      console.log('Проверьте карту XML элементов:', segmentXmlMap.value)
    }
    
    // Преобразуем XML обратно в строку
    const serializer = new XMLSerializer()
    const modifiedXml = serializer.serializeToString(xmlDoc)
    
    // Обновляем XML в архиве
    zip.file('word/document.xml', modifiedXml)
    
    // Генерируем новый документ
    const buf = zip.generate({
      type: 'blob',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    })
    
    // Создаем имя файла
    const originalName = originalFile.value.name
    const nameWithoutExt = originalName.replace(/\.[^/.]+$/, '')
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-')
    const exportName = `${nameWithoutExt}_translated_${timestamp}.docx`
    
    console.log(`Скачиваем файл: ${exportName}`)
    
    // Скачиваем файл
    saveAs(buf, exportName)
    
    console.log('Документ успешно экспортирован')
    alert(`Документ успешно экспортирован как: ${exportName}\n\nВыполнено замен: ${replacementsCount}\n\nПереведенный текст заменен в исходном документе с сохранением всех стилей и форматирования (как в профессиональных CAT-инструментах).`)
    
  } catch (error) {
    console.error('Ошибка при экспорте документа:', error)
    const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка'
    alert(`Ошибка при экспорте документа: ${errorMessage}`)
  }
}

// Очистка документа
const clearDocument = () => {
  sentences.value = []
  translations.value = []
  segmentXmlMap.value = []
  originalFile.value = null
  originalArrayBuffer.value = null
  originalDocumentXml.value = ''
  if (fileInput.value) {
    fileInput.value.value = ''
  }
}

// Загрузка сохраненной папки по умолчанию
onMounted(() => {
  const savedFolder = localStorage.getItem('translation-tool-default-folder')
  if (savedFolder) {
    defaultFolder.value = savedFolder
  }
})
</script>

<style>
/* Reset styles */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

/* App container */
#app {
  width: 100%;
  height: 100vh;
  display: flex;
  flex-direction: column;
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
}

/* Header */
.header {
  background: #2c3e50;
  color: white;
  padding: 1rem 2rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.header h1 {
  font-size: 1.5rem;
  font-weight: 600;
}

.controls {
  display: flex;
  gap: 1rem;
}

.upload-btn, .clear-btn, .export-btn {
  background: #3498db;
  color: white;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.9rem;
  transition: background 0.2s;
}

.upload-btn:hover {
  background: #2980b9;
}

.export-btn {
  background: #27ae60;
}

.export-btn:hover {
  background: #229954;
}

.clear-btn {
  background: #e74c3c;
}

.clear-btn:hover {
  background: #c0392b;
}

.upload-btn.large {
  padding: 1rem 2rem;
  font-size: 1.1rem;
}

/* Main container */
.container {
  display: flex;
  flex-direction: column;
  flex: 1;
  height: calc(100vh - 80px);
}

/* Общие заголовки */
.headers {
  display: flex;
  background: #34495e;
  color: white;
}

.header-left, .header-right {
  flex: 1;
  padding: 0.75rem 1rem;
  margin: 0;
  font-size: 1rem;
  font-weight: 500;
  text-align: center;
}

.header-left {
  border-right: 1px solid #2c3e50;
}

/* Единая область скролла */
.scroll-container {
  flex: 1;
  overflow-y: auto;
  scroll-behavior: smooth;
}

.sentences-content {
  padding: 1rem;
  background: #ffffff;
}

/* Строки предложений */
.sentence-row {
  display: flex;
  margin-bottom: 1rem;
  gap: 1rem;
  min-height: 100px;
}

.sentence-item {
  flex: 1;
  display: flex;
  align-items: stretch;
  gap: 0.5rem;
  height: 100px;
}

.left-item {
  background: #f8f9fa;
  padding: 0.5rem;
  border-radius: 4px;
  border: 1px solid #e0e0e0;
}

.right-item {
  background: #ffffff;
  padding: 0.5rem;
  border-radius: 4px;
  border: 1px solid #e0e0e0;
}

.sentence-number {
  background: #3498db;
  color: white;
  padding: 0.5rem;
  border-radius: 3px;
  font-size: 0.8rem;
  font-weight: bold;
  min-width: 2rem;
  height: 80px;
  text-align: center;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.sentence-text {
  flex: 1;
  padding: 0.5rem;
  background: #ecf0f1;
  border-radius: 4px;
  line-height: 1.4;
  color: #2c3e50;
  text-align: left;
  height: 80px;
  display: flex;
  align-items: flex-start;
  font-size: 0.9rem;
  font-family: inherit;
  overflow-y: auto;
}

.sentence-textarea {
  flex: 1;
  padding: 0.5rem;
  background: #ecf0f1;
  border: none;
  border-radius: 4px;
  resize: none;
  font-family: inherit;
  font-size: 0.9rem;
  line-height: 1.4;
  height: 80px;
  color: #2c3e50;
  text-align: left;
  outline: none;
  overflow-y: auto;
}

.sentence-textarea:focus {
  background: #ffffff;
  box-shadow: 0 0 0 2px rgba(52, 152, 219, 0.3);
}

/* Empty state */
.empty-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f8f9fa;
}

.empty-content {
  text-align: center;
  max-width: 400px;
}

.empty-content h2 {
  color: #2c3e50;
  margin-bottom: 1rem;
  font-size: 1.8rem;
}

.empty-content p {
  color: #7f8c8d;
  margin-bottom: 2rem;
  font-size: 1.1rem;
}

/* Scrollbar styling */
.sentences-list::-webkit-scrollbar {
  width: 8px;
}

.sentences-list::-webkit-scrollbar-track {
  background: #f1f1f1;
}

.sentences-list::-webkit-scrollbar-thumb {
  background: #c1c1c1;
  border-radius: 4px;
}

.sentences-list::-webkit-scrollbar-thumb:hover {
  background: #a8a8a8;
}
</style>

