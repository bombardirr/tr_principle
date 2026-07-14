import { describe, expect, it } from 'vitest'
import { mapTargetToSentences, resegmentParagraphs } from '@/tm/resegment'
import type { Segment } from '@/types/project'

function para(partial: Partial<Segment> & Pick<Segment, 'id' | 'source'>): Segment {
  return {
    storyKey: 'document',
    storyFile: 'word/document.xml',
    paraIndex: 0,
    paragraphKey: 'document:0',
    sentenceIndex: 0,
    target: '',
    status: 'empty',
    inTable: false,
    inTextbox: false,
    inCaption: false,
    spans: [{ runIndices: [0], fingerprint: 'r', text: partial.source }],
    ...partial,
  }
}

describe('mapTargetToSentences', () => {
  it('maps 1:1 when sentence counts match', () => {
    const { targets, ambiguous } = mapTargetToSentences(
      ['Я Артём.', 'Я Артём?'],
      'I am Artem. Am I Artem?',
    )
    expect(ambiguous).toBe(false)
    expect(targets).toEqual(['I am Artem.', 'Am I Artem?'])
  })

  it('puts whole target on first slot when counts differ', () => {
    const { targets, ambiguous } = mapTargetToSentences(
      ['One.', 'Two.'],
      'Whole paragraph translation',
    )
    expect(ambiguous).toBe(true)
    expect(targets).toEqual(['Whole paragraph translation', ''])
  })
})

describe('resegmentParagraphs', () => {
  it('splits multi-sentence paragraphs and upgrades shape', () => {
    const { segments, ambiguousCount } = resegmentParagraphs([
      para({
        id: '1',
        source: 'Я Артём. Я Артём?',
        target: 'I am Artem. Am I Artem?',
        status: 'done',
      }),
    ])
    expect(ambiguousCount).toBe(0)
    expect(segments).toHaveLength(2)
    expect(segments[0]).toMatchObject({
      id: '1',
      sentenceIndex: 0,
      source: 'Я Артём.',
      target: 'I am Artem.',
      status: 'done',
    })
    expect(segments[1]).toMatchObject({
      id: '2',
      sentenceIndex: 1,
      source: 'Я Артём?',
      target: 'Am I Artem?',
      status: 'done',
    })
    expect(segments[0]!.paragraphSpans?.length).toBeGreaterThan(0)
    expect(segments[1]!.spans).toEqual([])
  })

  it('keeps single-sentence paragraphs as one segment', () => {
    const { segments } = resegmentParagraphs([
      para({ id: '2', source: 'Hello.', target: 'Привет.', status: 'done' }),
    ])
    expect(segments).toHaveLength(1)
    expect(segments[0]).toMatchObject({
      id: '1',
      sentenceIndex: 0,
      source: 'Hello.',
      target: 'Привет.',
    })
  })

  it('merges date-shredded pieces back into one sentence', () => {
    const { segments } = resegmentParagraphs([
      para({
        id: '51',
        paragraphKey: 'document:55',
        paraIndex: 55,
        sentenceIndex: 0,
        source:
          'Просим Вас вернуть данное уведомление с соответствующими подписями в отдел управления персоналом в срок до 30.',
      }),
      para({
        id: '52',
        paragraphKey: 'document:55',
        paraIndex: 55,
        sentenceIndex: 1,
        source: '03.',
      }),
      para({
        id: '53',
        paragraphKey: 'document:55',
        paraIndex: 55,
        sentenceIndex: 2,
        source: '2026 г.',
      }),
      para({
        id: '54',
        paragraphKey: 'document:55',
        paraIndex: 55,
        sentenceIndex: 3,
        source:
          'для подготовки приказа об отпуске, а также для своевременного и полного расчета компенсации за предоставляемый отпуск.',
      }),
    ])
    expect(segments).toHaveLength(1)
    expect(segments[0]!.source).toBe(
      'Просим Вас вернуть данное уведомление с соответствующими подписями в отдел управления персоналом в срок до 30.03.2026 г. для подготовки приказа об отпуске, а также для своевременного и полного расчета компенсации за предоставляемый отпуск.',
    )
  })
})
