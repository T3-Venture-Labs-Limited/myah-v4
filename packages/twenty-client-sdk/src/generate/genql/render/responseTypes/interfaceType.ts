// @ts-nocheck
import { GraphQLInterfaceType } from 'graphql'
import { RenderContext } from '../common/RenderContext'
import { typeComment } from '../common/comment'
import { objectType } from './objectType'

export const interfaceType = (
    type: GraphQLInterfaceType,
    ctx: RenderContext,
) => {
    if (!ctx.schema) {
        throw new Error('schema is required to render unionType')
    }
    const typeNames = ctx.schema.getPossibleTypes(type).map((t) => t.name)
    if (!typeNames.length) {
        objectType(type, ctx)
    } else {
        ctx.addCodeBlock(
            `${typeComment(type)}export type ${type.name} = (${typeNames.join(
                ' | ',
            )}) & { __isUnion?: true }`,
        )
    }
}
