// @ts-nocheck
import { GraphQLNamedType } from 'graphql'
import { RenderContext } from '../common/RenderContext'

const knownTypes: {
    [name: string]: string
} = {
    Int: 'number',
    Float: 'number',
    String: 'string',
    Boolean: 'boolean',
    ID: 'string',
}

export const getTypeMappedAlias = (
    type: GraphQLNamedType,
    ctx: RenderContext,
) => {
    const map = { ...knownTypes, ...(ctx?.config?.scalarTypes || {}) }
    return map?.[type.name] || 'any'
}
