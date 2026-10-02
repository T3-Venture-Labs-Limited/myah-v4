import { MODULE_METADATA } from '@nestjs/common/constants';

import { PageLayoutModule } from 'src/engine/metadata-modules/page-layout/page-layout.module';
import { PageLayoutChartDataModule } from 'src/engine/metadata-modules/page-layout-widget/chart-data/page-layout-chart-data.module';
import { BarChartDataResolver } from 'src/engine/metadata-modules/page-layout-widget/chart-data/resolvers/bar-chart-data.resolver';
import { LineChartDataResolver } from 'src/engine/metadata-modules/page-layout-widget/chart-data/resolvers/line-chart-data.resolver';
import { PieChartDataResolver } from 'src/engine/metadata-modules/page-layout-widget/chart-data/resolvers/pie-chart-data.resolver';

describe('PageLayoutChartDataModule', () => {
  it('registers retained RECORD_PAGE graph query resolvers under the shared page-layout boundary', () => {
    expect(
      Reflect.getMetadata(MODULE_METADATA.IMPORTS, PageLayoutModule),
    ).toContain(PageLayoutChartDataModule);

    expect(
      Reflect.getMetadata(MODULE_METADATA.PROVIDERS, PageLayoutChartDataModule),
    ).toEqual(
      expect.arrayContaining([
        BarChartDataResolver,
        LineChartDataResolver,
        PieChartDataResolver,
      ]),
    );
  });

  it('keeps bar, line, and pie query handlers available', () => {
    expect(BarChartDataResolver.prototype.barChartData).toEqual(
      expect.any(Function),
    );
    expect(LineChartDataResolver.prototype.lineChartData).toEqual(
      expect.any(Function),
    );
    expect(PieChartDataResolver.prototype.pieChartData).toEqual(
      expect.any(Function),
    );
  });
});
