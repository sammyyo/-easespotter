import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:easespotter/services/share_service.dart';
import 'package:easespotter/services/grocery_draft_store.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test(
    'accepts current and legacy codes and only supported HTTPS invite links',
    () {
      final code = 'a' * 32;
      expect(ShareService.parseCode(' $code '), code.toUpperCase());
      expect(ShareService.parseCode('abc123'), 'ABC123');
      for (final host in ['easespotter.com', 'www.easespotter.com']) {
        expect(
          ShareService.parseCode('https://$host/share/$code'),
          code.toUpperCase(),
        );
      }
      for (final input in [
        '',
        'x',
        'https://evil.example/share/$code',
        'http://easespotter.com/share/$code',
        'https://easespotter.com/recipes/$code',
        'https://easespotter.com/share/$code/extra',
        'https://easespotter.com.evil.example/share/$code',
      ]) {
        expect(ShareService.parseCode(input), '', reason: input);
      }
    },
  );

  test('sign-in continuation persists and consumes invite once', () async {
    SharedPreferences.setMockInitialValues({});
    await ShareService.rememberInvite('ABC123');
    expect(await ShareService.takeInvite(), 'ABC123');
    expect(await ShareService.takeInvite(), isNull);
  });

  test(
    'interrupted latest edits recover once without replacing saved favorites',
    () async {
      SharedPreferences.setMockInitialValues({
        'user_alice_favorite_lists': jsonEncode([
          {'title': 'Existing', 'items': []},
        ]),
        'user_bob_favorite_lists': '[]',
      });
      final drafts = GroceryDraftStore('alice');
      await drafts.save([
        {'title': 'Old'},
      ]);
      await drafts.save([
        {'title': 'Latest', 'quantity': 2},
      ]);
      expect(await drafts.recover(), true);
      expect(await drafts.recover(), false);
      final prefs = await SharedPreferences.getInstance();
      final saved =
          jsonDecode(prefs.getString('user_alice_favorite_lists')!) as List;
      expect(saved.length, 2);
      expect(saved.first['title'], 'Existing');
      expect(saved.last['items'], [
        {'title': 'Latest', 'quantity': 2},
      ]);
      expect(prefs.getString('user_bob_favorite_lists'), '[]');
    },
  );

  test('acknowledged edits are not recovered as unsent changes', () async {
    SharedPreferences.setMockInitialValues({});
    final drafts = GroceryDraftStore('alice');
    await drafts.save([
      {'title': 'Milk'},
    ]);
    await drafts.clear();
    expect(await drafts.recover(), false);
  });
}
