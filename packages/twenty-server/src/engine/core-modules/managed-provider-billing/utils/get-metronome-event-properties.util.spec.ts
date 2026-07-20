import { getMetronomeEventProperties } from './get-metronome-event-properties.util';

describe('getMetronomeEventProperties', () => {
  it('projects only billing properties and hashes operation identity', () => {
    const first = getMetronomeEventProperties(
      {
        charge_cent_unit: '3',
        model_id: 'openrouter/model',
        tariff_version: 'tariff-v1',
        cashPaidMicrousd: '999',
        usableCreditsReceivedMicrousd: '888',
      },
      'operation-1',
    );

    expect(first).toEqual({
      charge_cent_unit: '3',
      model_id: 'openrouter/model',
      tariff_version: 'tariff-v1',
      operation_id:
        'managed-operation:' +
        '187f0349dd12b6dc73d76d86f421cd454facccc36ef9a2ba6956b37abbb31102',
    });
  });

  it.each(['alice@example.com', 'super-secret-token', 'x'.repeat(10_000)])(
    'never exposes untrusted operation identity: %s',
    (sourceId) => {
      const properties = getMetronomeEventProperties(
        {
          charge_cent_unit: '3',
          model_id: 'openrouter/model',
          tariff_version: 'tariff-v1',
        },
        sourceId,
      );

      expect(properties.operation_id).not.toContain(sourceId);
      expect(properties.operation_id).toHaveLength(82);
      expect(properties.operation_id).toMatch(
        /^managed-operation:[a-f0-9]{64}$/,
      );
    },
  );

  it('is deterministic while distinguishing source identities', () => {
    const properties = {
      charge_cent_unit: '3',
      model_id: 'openrouter/model',
      tariff_version: 'tariff-v1',
    };

    expect(getMetronomeEventProperties(properties, 'operation-1')).toEqual(
      getMetronomeEventProperties(properties, 'operation-1'),
    );
    expect(getMetronomeEventProperties(properties, 'operation-1')).not.toEqual(
      getMetronomeEventProperties(properties, 'operation-2'),
    );
  });

  it('rejects missing billing identity', () => {
    expect(() =>
      getMetronomeEventProperties({ charge_cent_unit: '1' }, 'operation-1'),
    ).toThrow('Metronome properties are incomplete');
  });

  it('validates canonical properties after operation identity injection', () => {
    expect(() =>
      getMetronomeEventProperties(
        {
          charge_cent_unit: '1',
          model_id: 'openrouter/model',
          tariff_version: 'tariff-v1',
        },
        'operation-1',
      ),
    ).not.toThrow();
  });
});
