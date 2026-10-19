import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:easespotter/services/store_api_service.dart';
import 'package:easespotter/services/store_location.dart';

Map<String, dynamic> location([Map<String, dynamic> extra = const {}]) => {
  'storeId': 12,
  'storeName': 'Market',
  'formattedAddress': 'Main Street 1',
  'latitude': 52.52,
  'longitude': 13.405,
  'distanceMeters': 125.0,
  ...extra,
};

void main() {
  test('reads coordinates, address and stable vendor ID, including valid zero coordinates', () {
    final store = StoreLocation.fromJson(location())!;
    expect(store.storeId, 12);
    expect(store.address, 'Main Street 1');
    expect(store.distanceMeters, 125);
    expect(
      StoreLocation.fromJson(location({'latitude': 0, 'longitude': 0})),
      isNotNull,
    );
    expect(
      StoreLocation.fromJson(
        location({'latitude': '52.52', 'longitude': '13.405'}),
      ),
      isNotNull,
    );
  });

  test('rejects missing, invalid and nonfinite coordinates and distances', () {
    for (final extra in [
      {'latitude': null},
      {'latitude': 91},
      {'longitude': -181},
      {'latitude': double.nan},
      {'longitude': double.infinity},
      {'distanceMeters': -1},
      {'distanceMeters': double.infinity},
      {'formattedAddress': ''},
      {'storeId': 0},
    ]) {
      expect(StoreLocation.fromJson(location(extra)), isNull, reason: '$extra');
    }
  });

  test(
    'nearby requests use one bounded endpoint and preserve sorted response',
    () async {
      var calls = 0;
      final client = MockClient((request) async {
        calls++;
        expect(request.url.path, '/api/stores/nearby');
        expect(request.url.queryParameters['latitude'], '52.52');
        expect(request.url.queryParameters['radiusKm'], '50');
        expect(request.url.queryParameters['limit'], '10');
        return http.Response(
          jsonEncode({
            'success': true,
            'data': [
              location(),
              location({'storeId': 13, 'distanceMeters': 200}),
              location({'latitude': null}),
            ],
          }),
          200,
        );
      });
      final stores = await StoreApiService.fetchNearbyStores(
        latitude: 52.52,
        longitude: 13.405,
        client: client,
      );
      expect(calls, 1);
      expect(stores.map((s) => s.storeId), [12, 13]);
    },
  );

  test(
    'network/API failures are not treated as an empty nearby result',
    () async {
      for (final response in [
        http.Response('unavailable', 503),
        http.Response('<html>wrong route</html>', 200),
        http.Response('{"success":false,"data":[]}', 200),
      ]) {
        final client = MockClient((_) async => response);
        await expectLater(
          StoreApiService.fetchNearbyStores(
            latitude: 0,
            longitude: 0,
            client: client,
          ),
          throwsA(isA<Exception>()),
        );
      }
    },
  );

  test(
    'address lookup distinguishes a missing store from a server failure',
    () async {
      expect(
        await StoreApiService.fetchStoreAddresses(
          12,
          client: MockClient((_) async => http.Response('', 404)),
        ),
        isEmpty,
      );
      await expectLater(
        StoreApiService.fetchStoreAddresses(
          12,
          client: MockClient((_) async => http.Response('unavailable', 503)),
        ),
        throwsException,
      );
      final rows = await StoreApiService.fetchStoreAddresses(
        12,
        client: MockClient((request) async {
          expect(request.url.path, '/api/stores/12/addresses');
          return http.Response(
            jsonEncode({
              'success': true,
              'data': [location()],
            }),
            200,
          );
        }),
      );
      expect(StoreLocation.fromJson(rows.single)?.storeId, 12);
    },
  );

  test('invalid device coordinates are rejected before any request', () async {
    final client = MockClient((_) async {
      fail('No request should be made');
    });
    await expectLater(
      StoreApiService.fetchNearbyStores(
        latitude: double.nan,
        longitude: 0,
        client: client,
      ),
      throwsArgumentError,
    );
  });
}
