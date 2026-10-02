import { Field, ObjectType } from '@nestjs/graphql';

import { LineChartDataPointDTO } from 'src/engine/metadata-modules/page-layout-widget/chart-data/dtos/line-chart-data-point.dto';

@ObjectType('LineChartSeries')
export class LineChartSeriesDTO {
  @Field(() => String)
  key: string;

  @Field(() => String)
  label: string;

  @Field(() => [LineChartDataPointDTO])
  data: LineChartDataPointDTO[];
}
