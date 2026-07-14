import { describe, expect, it } from 'vitest'
import { isCompositeSegment, splitTmFragments } from '@/tm/fragments'

describe('tm fragments', () => {
  it('splits on sentence boundaries with spaces', () => {
    expect(
      splitTmFragments('Вы нам нравитесь. Вы нам реально нравитесь. Вы нам нравитесь?'),
    ).toEqual([
      'Вы нам нравитесь.',
      'Вы нам реально нравитесь.',
      'Вы нам нравитесь?',
    ])
  })

  it('splits when there is no space after a period', () => {
    expect(splitTmFragments('Вы нам нравитесь.Вы нам реально нравитесь.')).toEqual([
      'Вы нам нравитесь.',
      'Вы нам реально нравитесь.',
    ])
  })

  it('returns single fragment for one sentence', () => {
    expect(splitTmFragments('Вы нам нравитесь.')).toEqual(['Вы нам нравитесь.'])
  })

  it('keeps trailing sentence without punctuation as its own fragment', () => {
    expect(
      splitTmFragments('Вы нам нравитесь. Вы нам реально нравитесь. Вы нам нравитесь'),
    ).toEqual([
      'Вы нам нравитесь.',
      'Вы нам реально нравитесь.',
      'Вы нам нравитесь',
    ])
  })

  it('does not split decimal dates like 13.04.2026', () => {
    expect(
      splitTmFragments(
        'отпуск с 13.04.2026 по 26.04.2026 сроком на 14 календарных дней.',
      ),
    ).toEqual(['отпуск с 13.04.2026 по 26.04.2026 сроком на 14 календарных дней.'])
  })

  it('keeps the vacation notice deadline sentence intact', () => {
    const sentence =
      'Просим Вас вернуть данное уведомление с соответствующими подписями в отдел управления персоналом в срок до 30.03.2026 г. для подготовки приказа об отпуске, а также для своевременного и полного расчета компенсации за предоставляемый отпуск.'
    expect(splitTmFragments(sentence)).toEqual([sentence])
  })

  it('still splits real sentences after a date when the next sentence starts with a capital', () => {
    expect(splitTmFragments('До 30.03.2026 г. Далее другой текст.')).toEqual([
      'До 30.03.2026 г.',
      'Далее другой текст.',
    ])
  })

  it('does not split after year abbreviation before lowercase continuation', () => {
    expect(
      splitTmFragments(
        'в срок до 30.03.2026 г. для подготовки приказа об отпуске.',
      ),
    ).toEqual(['в срок до 30.03.2026 г. для подготовки приказа об отпуске.'])
  })

  it('protects slash and ISO date forms', () => {
    expect(splitTmFragments('Срок до 30/03/2026 для сдачи.')).toEqual([
      'Срок до 30/03/2026 для сдачи.',
    ])
    expect(splitTmFragments('Срок до 2026-03-30 для сдачи.')).toEqual([
      'Срок до 2026-03-30 для сдачи.',
    ])
  })

  it('protects Russian wordy dates including abbreviated months', () => {
    expect(
      splitTmFragments('Отпуск с 13 апреля 2026 по 26 апр. 2026 сроком на 14 дней.'),
    ).toEqual(['Отпуск с 13 апреля 2026 по 26 апр. 2026 сроком на 14 дней.'])
  })

  it('protects English wordy dates', () => {
    expect(
      splitTmFragments('Leave from March 30, 2026 through 26th of April 2026 inclusive.'),
    ).toEqual(['Leave from March 30, 2026 through 26th of April 2026 inclusive.'])
    expect(splitTmFragments('Due by 30 Mar. 2026 for filing.')).toEqual([
      'Due by 30 Mar. 2026 for filing.',
    ])
  })

  it('still splits after an English date before a new capital sentence', () => {
    expect(splitTmFragments('Due by March 30, 2026. Please reply.')).toEqual([
      'Due by March 30, 2026.',
      'Please reply.',
    ])
  })
})
