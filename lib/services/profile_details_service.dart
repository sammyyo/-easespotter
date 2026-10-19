import 'package:cloud_firestore/cloud_firestore.dart';

const profileDetailFields = <String, ({String label, String hint})>{
  'city': (label: 'City or region', hint: 'e.g. Berlin — no street address'),
  'interests': (label: 'Food interests', hint: 'e.g. Baking, seasonal cooking'),
  'cuisines': (label: 'Favourite cuisines', hint: 'e.g. Italian, Thai'),
  'dietaryPreferences': (
    label: 'Dietary preferences',
    hint: 'e.g. Vegetarian, dairy-free',
  ),
  'favouriteStores': (
    label: 'Favourite stores',
    hint: 'e.g. Local market, REWE',
  ),
};

class ProfileDetails {
  ProfileDetails({
    Map<String, String> values = const {},
    Set<String> shared = const {},
  }) : values = Map.unmodifiable({
         for (final key in profileDetailFields.keys) key: values[key] ?? '',
       }),
       shared = Set.unmodifiable(shared.where(profileDetailFields.containsKey));

  factory ProfileDetails.fromMap(Map<String, dynamic> data) {
    final values = data['values'] is Map ? data['values'] as Map : const {};
    final sharing = data['sharing'] is Map ? data['sharing'] as Map : const {};
    return ProfileDetails(
      values: {
        for (final key in profileDetailFields.keys)
          key: values[key] is String ? values[key] as String : '',
      },
      shared: {
        for (final key in profileDetailFields.keys)
          if (sharing[key] == true) key,
      },
    );
  }

  final Map<String, String> values;
  final Set<String> shared;

  Map<String, String> get publicValues => {
    for (final key in profileDetailFields.keys)
      key: shared.contains(key) ? values[key]!.trim() : '',
  };

  Map<String, dynamic> toMap() => {
    'values': {
      for (final key in profileDetailFields.keys) key: values[key]!.trim(),
    },
    'sharing': {
      for (final key in profileDetailFields.keys) key: shared.contains(key),
    },
  };
}

class ProfileDetailsService {
  ProfileDetailsService(this.db);
  final FirebaseFirestore db;

  CollectionReference<Map<String, dynamic>> _collection(String uid) =>
      db.collection('users').doc(uid).collection('profileDetails');

  Future<ProfileDetails> load(String uid) async {
    final doc = await _collection(uid)
        .doc('private')
        .get(const GetOptions(source: Source.server));
    return ProfileDetails.fromMap(doc.data() ?? {});
  }

  Future<void> save(String uid, ProfileDetails details) async {
    final batch = db.batch();
    batch.set(_collection(uid).doc('private'), details.toMap());
    // Replace the public document so hiding or clearing a field removes its value.
    batch.set(_collection(uid).doc('public'), details.publicValues);
    await batch.commit();
  }
}
