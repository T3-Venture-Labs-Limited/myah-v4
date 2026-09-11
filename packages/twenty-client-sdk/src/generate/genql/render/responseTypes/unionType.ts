// @ts-nocheck
import { GraphQLUnionType } from 'graphql'
import { RenderContext } from '../common/RenderContext'
import { typeComment } from '../common/comment'


export const unionType = (type: GraphQLUnionType, ctx: RenderContext) => {
    let typeNames = type.getTypes().map((t) => t.name)
    if (ctx.config?.sortProperties) {
        typeNames = typeNames.sort()
    }
    ctx.addCodeBlock(
        `${typeComment(type)}export type ${type.name} = (${typeNames.join(
            ' | ',
        )}) & { __isUnion?: true }`,
    )
}
