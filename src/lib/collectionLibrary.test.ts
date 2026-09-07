import { describe, expect, it } from 'vitest'
import { createCollectionDefinition, nextFeatureLabel, parseCollectionLibrary, suggestCollectionCode } from './collectionLibrary'

describe('live collection memory', () => {
  it('builds a field code from the name', () => {
    expect(suggestCollectionCode('Manhole')).toBe('MNHL')
    expect(suggestCollectionCode('Sewer pipe')).toBe('SP')
  })

  it('creates a reusable definition from minimal live input', () => {
    const definition = createCollectionDefinition({ name: 'Manhole', geometryType: 'point' })
    expect(definition.code).toBe('MNHL')
    expect(definition.group).toBe('Field data')
    expect(definition.style.color).toBe('#31c4d6')
  })

  it('numbers features within their layer', () => {
    expect(nextFeatureLabel({ code: 'MH', name: 'Manholes' } as never, 8)).toBe('MH-009')
  })

  it('rejects malformed remembered data', () => {
    expect(parseCollectionLibrary('{bad')).toEqual([])
    expect(parseCollectionLibrary('[{"name":"Missing id"}]')).toEqual([])
  })
})
