class StoreLocation {
  const StoreLocation({
    required this.storeId,
    required this.name,
    required this.address,
    required this.latitude,
    required this.longitude,
    this.logoUrl,
    this.distanceMeters,
  });
  final int storeId;
  final String name;
  final String address;
  final double latitude;
  final double longitude;
  final String? logoUrl;
  final double? distanceMeters;

  static StoreLocation? fromJson(Map<String, dynamic> data) {
    double? number(dynamic value) =>
        value is num ? value.toDouble() : double.tryParse('$value');
    final id = int.tryParse('${data['storeId'] ?? data['vendorId']}');
    final lat = number(data['latitude']);
    final lng = number(data['longitude']);
    final distance = number(data['distanceMeters']);
    final address = (data['formattedAddress'] ?? data['address'] ?? '')
        .toString()
        .trim();
    if (id == null ||
        id <= 0 ||
        address.isEmpty ||
        lat == null ||
        lng == null ||
        !lat.isFinite ||
        !lng.isFinite ||
        lat.abs() > 90 ||
        lng.abs() > 180 ||
        (distance != null && (!distance.isFinite || distance < 0)))
      return null;
    return StoreLocation(
      storeId: id,
      name: (data['storeName'] ?? data['label'] ?? 'Store').toString(),
      address: address,
      latitude: lat,
      longitude: lng,
      logoUrl: data['logoUrl']?.toString(),
      distanceMeters: distance,
    );
  }
}
