import 'package:easespotter/services/profile_details_service.dart';
import 'package:easespotter/widgets/shared_profile_details.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test(
    'new details are hidden by default while private values are retained',
    () {
      final details = ProfileDetails(
        values: {'city': 'Berlin', 'dietaryPreferences': 'Vegetarian'},
      );
      expect(
        details.publicValues.values.every((value) => value.isEmpty),
        isTrue,
      );
      expect((details.toMap()['values'] as Map)['city'], 'Berlin');
    },
  );

  test('only explicit sharing publishes trimmed values', () {
    final details = ProfileDetails(
      values: {'city': ' Berlin ', 'interests': 'Baking'},
      shared: {'city'},
    );
    expect(details.publicValues['city'], 'Berlin');
    expect(details.publicValues['interests'], isEmpty);
    expect(
      ProfileDetails.fromMap(details.toMap()).publicValues,
      details.publicValues,
    );
  });

  test('missing and malformed sharing flags never publish private data', () {
    final details = ProfileDetails.fromMap({
      'values': {'city': 'Berlin', 'dietaryPreferences': 'Vegetarian'},
      'sharing': {'city': 'true'},
    });
    expect(details.shared, isEmpty);
    expect(details.publicValues['city'], isEmpty);
  });

  test('turning sharing off removes the public copy without deleting the private value', () {
    final before = ProfileDetails(values: {'city': 'Berlin'}, shared: {'city'});
    final after = ProfileDetails(values: before.values);
    expect(after.values['city'], 'Berlin');
    expect(after.publicValues['city'], isEmpty);
  });

  testWidgets('public summary omits blank fields and unknown data', (
    tester,
  ) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: ProfileDetailsSummary(
            values: {
              'city': 'Berlin',
              'interests': '',
              'email': 'private@example.com',
            },
          ),
        ),
      ),
    );
    expect(find.text('City or region'), findsOneWidget);
    expect(find.text('Berlin'), findsOneWidget);
    expect(find.text('Food interests'), findsNothing);
    expect(find.text('private@example.com'), findsNothing);
  });
}
