import 'dart:ui';

import 'package:google_mlkit_text_recognition/google_mlkit_text_recognition.dart';

class ReceiptParserService {
  static final RegExp _linePricePattern = RegExp(
    r'(.+?)\s+(?:[$€£¥₦₵₹₩₺₽₪₫฿₱R]\s*)?(-?\d{1,6}(?:[.,]\d{2}))(?:\s*(?:[$€£¥₦₵₹₩₺₽₪₫฿₱R]|[A-Z]{3}))?\s*[A-Z*]?\s*$',
  );

  static final RegExp _standalonePricePattern = RegExp(
    r'^(?:[$€£¥₦₵₹₩₺₽₪₫฿₱R]\s*)?(-?\d{1,6}(?:[.,]\d{2}))(?:\s*(?:[$€£¥₦₵₹₩₺₽₪₫฿₱R]|[A-Z]{1,3}))?\s*$',
  );

  static final RegExp _noisePattern = RegExp(
    r'\b(preis|price|prix|precio|preço|preco|summe|sume|somme|suma|total|totale|subtotal|sub\s*total|zwischensumme|tax|vat|iva|tva|mwst|ust|steuer|impuesto|imposto|brutto|netto|net|gross|euro|eur|cash|change|rückgeld|ruckgeld|wechselgeld|monnaie|cambio|troco|card|karte|visa|mastercard|amex|debit|credit|auth|approval|transaction|trans|receipt|ticket|recibo|bon|order|terminal|cashier|cassier|cajero|caixa|register|kasse|store|filiale|date|datum|fecha|data|time|zeit|hora|thank|thanks|danke|merci|gracias|obrigado|coupon|discount|rabatt|savings|payment|zahlung|pago|pagamento|balance|barcode|qr)\b',
    caseSensitive: false,
  );

  static final RegExp _summaryLabelPattern = RegExp(
    r'^\s*(summe|sume|somme|suma|total|totale|gesamt|grand\s*total|amount\s*due|balance\s*due|zu\s*zahlen|subtotal|sub\s*total|zwischensumme|tax|vat|iva|tva|mwst|ust|steuer|impuesto|imposto|brutto|netto|net|gross|cash|bar|change|rückgeld|ruckgeld|wechselgeld|monnaie|cambio|troco|card|karte|debit|credit|paid|tendered|payment|zahlung|pago|pagamento|prix|precio|preço|preco|price|preis|euro|eur|usd|gbp|jpy|ngn|ghs|inr|krw|try|rub|ils|thb|php|zar|kes|mxn|brl|chf|cny)\b',
    caseSensitive: false,
  );

  Map<String, dynamic> parseReceipt(RecognizedText recognizedText) {
    final items = parseRecognizedText(recognizedText);
    final currency = _detectCurrency(recognizedText.text);
    final storeName = _detectStoreName(recognizedText);
    final total = _detectReceiptTotal(recognizedText.text) ?? _sumItems(items);

    final enrichedItems =
        items.map((item) {
          return {
            ...item,
            if (storeName != null) 'storeName': storeName,
            if (total != null) 'receiptTotal': total,
            if (currency != null) 'currency': currency,
          };
        }).toList();

    return {
      'items': enrichedItems,
      if (storeName != null) 'storeName': storeName,
      if (total != null) 'total': total,
      if (currency != null) 'currency': currency,
    };
  }

  List<Map<String, dynamic>> parseRecognizedText(
    RecognizedText recognizedText,
  ) {
    final pairedItems = _parsePositionedLines(recognizedText);
    if (pairedItems.isNotEmpty) return pairedItems;
    return parseItems(recognizedText.text);
  }

  List<Map<String, dynamic>> parseItems(String text) {
    final items = <Map<String, dynamic>>[];
    final seen = <String>{};

    for (final rawLine in text.split(RegExp(r'\r?\n'))) {
      final line = _normalizeWhitespace(rawLine);
      if (line.length < 4) continue;
      if (_noisePattern.hasMatch(line)) continue;

      final match = _linePricePattern.firstMatch(line);
      if (match == null) continue;

      final rawName = match.group(1) ?? '';
      final rawPrice = match.group(2) ?? '';
      final name = _cleanItemName(rawName);
      final price = _parseMoney(rawPrice);
      final currency = _detectCurrency(text);

      if (name.length < 2 || price == null || price <= 0) continue;
      if (_looksLikeSummaryLabel(name)) continue;
      if (_looksLikeReceiptMetadata(name)) continue;

      final key = name.toLowerCase();
      if (seen.contains(key)) continue;
      seen.add(key);

      items.add({
        'title': name,
        'checked': false,
        'category': 'General',
        'quantity': 1,
        'unitPrice': price,
        'price': price,
        'source': 'receipt',
        if (currency != null) 'currency': currency,
      });
    }

    return items;
  }

  List<Map<String, dynamic>> _parsePositionedLines(
    RecognizedText recognizedText,
  ) {
    final lines = <_ReceiptLine>[];
    for (final block in recognizedText.blocks) {
      for (final line in block.lines) {
        final text = _normalizeWhitespace(line.text);
        if (text.length < 2) continue;
        lines.add(_ReceiptLine(text: text, bounds: line.boundingBox));
      }
    }

    if (lines.isEmpty) return [];

    final receiptText = recognizedText.text;
    final currency = _detectCurrency(receiptText);
    final items = <Map<String, dynamic>>[];
    final usedNameIndexes = <int>{};
    final seen = <String>{};

    for (var i = 0; i < lines.length; i++) {
      final priceLine = lines[i];
      final price = _priceFromLine(priceLine.text);
      if (price == null || price <= 0) continue;
      if (_noisePattern.hasMatch(priceLine.text)) continue;

      final sameLineMatch = _linePricePattern.firstMatch(priceLine.text);
      if (sameLineMatch != null) {
        final name = _cleanItemName(sameLineMatch.group(1) ?? '');
        if (_addParsedItem(
          items: items,
          seen: seen,
          name: name,
          price: price,
          currency: currency,
        )) {
          continue;
        }
      }

      final nameIndex = _findBestNameLineIndex(
        lines: lines,
        priceLineIndex: i,
        usedNameIndexes: usedNameIndexes,
      );
      if (nameIndex == null) continue;

      final name = _cleanItemName(lines[nameIndex].text);
      if (_addParsedItem(
        items: items,
        seen: seen,
        name: name,
        price: price,
        currency: currency,
      )) {
        usedNameIndexes.add(nameIndex);
      }
    }

    return items;
  }

  int? _findBestNameLineIndex({
    required List<_ReceiptLine> lines,
    required int priceLineIndex,
    required Set<int> usedNameIndexes,
  }) {
    final priceLine = lines[priceLineIndex];
    final priceCenterY = priceLine.centerY;
    final maxDistance = priceLine.bounds.height.clamp(18.0, 56.0);

    var bestIndex = null as int?;
    var bestScore = double.infinity;

    for (var i = 0; i < lines.length; i++) {
      if (i == priceLineIndex || usedNameIndexes.contains(i)) continue;

      final candidate = lines[i];
      if (candidate.bounds.left >= priceLine.bounds.left) continue;
      if (_noisePattern.hasMatch(candidate.text)) continue;
      if (_looksLikeSummaryLabel(candidate.text)) continue;
      if (_priceFromLine(candidate.text) != null) continue;

      final name = _cleanItemName(candidate.text);
      if (name.length < 2 || _looksLikeReceiptMetadata(name)) continue;

      final yDistance = (candidate.centerY - priceCenterY).abs();
      if (yDistance > maxDistance) continue;

      final score = yDistance + (candidate.bounds.left / 1000);
      if (score < bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    }

    return bestIndex;
  }

  bool _addParsedItem({
    required List<Map<String, dynamic>> items,
    required Set<String> seen,
    required String name,
    required double price,
    required String? currency,
  }) {
    if (name.length < 2 || price <= 0) return false;
    if (_noisePattern.hasMatch(name)) return false;
    if (_looksLikeSummaryLabel(name)) return false;
    if (_looksLikeReceiptMetadata(name)) return false;

    final key = name.toLowerCase();
    if (seen.contains(key)) return false;

    seen.add(key);
    items.add({
      'title': name,
      'checked': false,
      'category': 'General',
      'quantity': 1,
      'unitPrice': price,
      'price': price,
      'source': 'receipt',
      if (currency != null) 'currency': currency,
    });
    return true;
  }

  double? _priceFromLine(String text) {
    final standalone = _standalonePricePattern.firstMatch(text);
    if (standalone != null) return _parseMoney(standalone.group(1) ?? '');

    final linePrice = _linePricePattern.firstMatch(text);
    if (linePrice != null) return _parseMoney(linePrice.group(2) ?? '');

    return null;
  }

  String _normalizeWhitespace(String value) {
    return value.replaceAll(RegExp(r'\s+'), ' ').trim();
  }

  String _cleanItemName(String value) {
    var cleaned =
        value
            .replaceAll(RegExp(r'^[#*\-\s]+'), '')
            .replaceAll(RegExp(r'\b\d{8,14}\b'), '')
            .replaceAll(
              RegExp(r'\b\d+\s*@\s*[$€£¥₦₵₹₩₺₽₪₫฿₱R]?\d+(?:[.,]\d{2})\b'),
              '',
            )
            .replaceAll(RegExp(r'\s+[A-Z]$'), '')
            .replaceAll(RegExp(r'\s+'), ' ')
            .trim();

    cleaned =
        cleaned
            .replaceAll(RegExp(r'^[0-9\s]+'), '')
            .replaceAll(RegExp(r'^[A-Z]{2,4}\s+(?=[A-Za-zÀ-ÿ])'), '')
            .trim();
    if (cleaned.isEmpty) return cleaned;

    return cleaned
        .split(' ')
        .where((part) => part.trim().isNotEmpty)
        .map(_titleCaseWord)
        .join(' ');
  }

  String _titleCaseWord(String word) {
    if (word.length <= 2 && word == word.toUpperCase()) return word;
    final lower = word.toLowerCase();
    return '${lower[0].toUpperCase()}${lower.substring(1)}';
  }

  bool _looksLikeReceiptMetadata(String name) {
    final digits = RegExp(r'\d').allMatches(name).length;
    final letters = RegExp(r'[A-Za-zÀ-ÿ]').allMatches(name).length;
    return letters == 0 || digits > letters * 2;
  }

  bool _looksLikeSummaryLabel(String name) {
    final compact = name.toLowerCase().replaceAll(RegExp(r'[^a-zà-ÿ]'), '');
    if (compact.isEmpty) return false;
    if (_summaryLabelPattern.hasMatch(name)) return true;

    const compactLabels = {
      'summe',
      'sume',
      'somme',
      'suma',
      'total',
      'totale',
      'gesamt',
      'subtotal',
      'zwischensumme',
      'tax',
      'vat',
      'iva',
      'tva',
      'mwst',
      'ust',
      'steuer',
      'impuesto',
      'imposto',
      'brutto',
      'netto',
      'gross',
      'cash',
      'bar',
      'change',
      'ruckgeld',
      'rückgeld',
      'wechselgeld',
      'monnaie',
      'cambio',
      'troco',
      'card',
      'karte',
      'debit',
      'credit',
      'paid',
      'tendered',
      'payment',
      'zahlung',
      'pago',
      'pagamento',
      'balance',
      'amountdue',
      'balancedue',
      'grandtotal',
      'zuzahlen',
      'price',
      'preis',
      'prix',
      'precio',
      'preco',
      'preço',
    };

    return compactLabels.contains(compact);
  }

  double? _parseMoney(String rawValue) {
    var value = rawValue.replaceAll(RegExp('[^0-9,.-]'), '').trim();
    if (value.isEmpty) return null;

    final lastComma = value.lastIndexOf(',');
    final lastDot = value.lastIndexOf('.');

    if (lastComma != -1 && lastDot != -1) {
      final decimalSeparator = lastComma > lastDot ? ',' : '.';
      final thousandsSeparator = decimalSeparator == ',' ? '.' : ',';
      value = value
          .replaceAll(thousandsSeparator, '')
          .replaceAll(decimalSeparator, '.');
    } else if (lastComma != -1) {
      value = value.replaceAll(',', '.');
    }

    return double.tryParse(value);
  }

  String? _detectCurrency(String text) {
    if (RegExp(r'€|\b(EUR|EURO)\b', caseSensitive: false).hasMatch(text)) {
      return 'EUR';
    }
    if (RegExp(r'£|\bGBP\b', caseSensitive: false).hasMatch(text)) {
      return 'GBP';
    }
    if (RegExp(
      r'\$|\b(USD|CAD|AUD|MXN)\b',
      caseSensitive: false,
    ).hasMatch(text)) {
      return 'USD';
    }
    if (RegExp(r'¥|\b(JPY|CNY|RMB)\b', caseSensitive: false).hasMatch(text)) {
      return 'JPY';
    }
    if (RegExp(r'₦|\bNGN\b', caseSensitive: false).hasMatch(text)) {
      return 'NGN';
    }
    if (RegExp(r'₵|\bGHS\b', caseSensitive: false).hasMatch(text)) {
      return 'GHS';
    }
    if (RegExp(r'₹|\bINR\b', caseSensitive: false).hasMatch(text)) {
      return '₹';
    }
    if (RegExp(r'₩|\bKRW\b', caseSensitive: false).hasMatch(text)) {
      return '₩';
    }
    if (RegExp(r'₺|\bTRY\b', caseSensitive: false).hasMatch(text)) {
      return '₺';
    }
    if (RegExp(r'₽|\bRUB\b', caseSensitive: false).hasMatch(text)) {
      return '₽';
    }
    if (RegExp(r'₪|\bILS\b', caseSensitive: false).hasMatch(text)) {
      return '₪';
    }
    if (RegExp(r'฿|\bTHB\b', caseSensitive: false).hasMatch(text)) {
      return '฿';
    }
    if (RegExp(r'₱|\bPHP\b', caseSensitive: false).hasMatch(text)) {
      return '₱';
    }
    if (RegExp(r'\bZAR\b', caseSensitive: false).hasMatch(text)) {
      return 'ZAR';
    }
    if (RegExp(r'\bKES\b', caseSensitive: false).hasMatch(text)) {
      return 'KES';
    }
    return null;
  }

  String? _detectStoreName(RecognizedText recognizedText) {
    final lines = <_ReceiptLine>[];
    for (final block in recognizedText.blocks) {
      for (final line in block.lines) {
        final text = _normalizeWhitespace(line.text);
        if (text.length < 2) continue;
        lines.add(_ReceiptLine(text: text, bounds: line.boundingBox));
      }
    }

    lines.sort((a, b) {
      final y = a.bounds.top.compareTo(b.bounds.top);
      if (y != 0) return y;
      return a.bounds.left.compareTo(b.bounds.left);
    });

    for (final line in lines.take(8)) {
      final text = line.text;
      if (_linePricePattern.hasMatch(text)) continue;
      if (_standalonePricePattern.hasMatch(text)) continue;
      if (_looksLikeReceiptMetadata(text)) continue;
      if (RegExp(r'\b\d{4,}\b').hasMatch(text)) continue;
      if (RegExp(
        r'\b(receipt|ticket|recibo|bon|invoice|rechnung|datum|date|time|zeit|tax|vat|ust|mwst)\b',
        caseSensitive: false,
      ).hasMatch(text)) {
        continue;
      }

      return _cleanStoreName(text);
    }

    return null;
  }

  String _cleanStoreName(String value) {
    return value
        .replaceAll(RegExp(r'\s+[-–—]\s+.*$'), '')
        .replaceAll(RegExp(r'\s+'), ' ')
        .trim();
  }

  double? _detectReceiptTotal(String text) {
    final totalPattern = RegExp(
      r'\b(summe|sume|suma|somme|total|totale|grand\s+total|amount\s+due|balance\s+due|gesamt|zu\s+zahlen)\b.*?(-?\d{1,6}(?:[.,]\d{2}))',
      caseSensitive: false,
    );

    for (final rawLine in text.split(RegExp(r'\r?\n'))) {
      final line = _normalizeWhitespace(rawLine);
      final match = totalPattern.firstMatch(line);
      if (match == null) continue;
      final total = _parseMoney(match.group(2) ?? '');
      if (total != null && total > 0) return total;
    }

    return null;
  }

  double? _sumItems(List<Map<String, dynamic>> items) {
    if (items.isEmpty) return null;
    return items.fold<double>(0, (sum, item) {
      final price =
          double.tryParse(item['price']?.toString() ?? '') ??
          double.tryParse(item['unitPrice']?.toString() ?? '') ??
          0.0;
      return sum + price;
    });
  }
}

class _ReceiptLine {
  final String text;
  final Rect bounds;

  const _ReceiptLine({required this.text, required this.bounds});

  double get centerY => bounds.top + bounds.height / 2;
}
