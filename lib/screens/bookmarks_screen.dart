import 'package:flutter/material.dart';
import 'package:easespotter/services/bookmark_service.dart';

class BookmarksScreen extends StatefulWidget {
  const BookmarksScreen({super.key});

  @override
  _BookmarksScreenState createState() => _BookmarksScreenState();
}

class _BookmarksScreenState extends State<BookmarksScreen> {
  final BookmarkService _bookmarkService = BookmarkService();
  final ScrollController _scrollController = ScrollController();
  List<Map<String, dynamic>> _bookmarks = [];
  bool _showClearButton = false;

  @override
  void initState() {
    super.initState();
    _loadBookmarks();
    _scrollController.addListener(_handleScroll);
  }

  void _handleScroll() {
    if (_scrollController.offset > 100 && !_showClearButton) {
      setState(() => _showClearButton = true);
    } else if (_scrollController.offset <= 100 && _showClearButton) {
      setState(() => _showClearButton = false);
    }
  }

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  void _loadBookmarks() async {
    final bookmarks = await _bookmarkService.getBookmarks();
    setState(() {
      _bookmarks = bookmarks;
    });
  }

  void _removeBookmark(Map<String, dynamic> item) async {
    await _bookmarkService.removeBookmark(item);
    _loadBookmarks();

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('“${item['name']}” removed from bookmarks'),
        backgroundColor: Colors.red[600],
        duration: const Duration(seconds: 2),
        behavior: SnackBarBehavior.floating,
      ),
    );
  }

  void _clearAllBookmarks() async {
    final shouldClear = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Clear All Bookmarks'),
        content: const Text('Are you sure you want to remove all bookmarks?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel', style: TextStyle(color: Colors.white)),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Clear All', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );

    if (shouldClear == true) {
      await _bookmarkService.clearAllBookmarks();
      _loadBookmarks();

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: const Text('All bookmarks cleared'),
          backgroundColor: Colors.red[600],
          duration: const Duration(seconds: 2),
          behavior: SnackBarBehavior.floating,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: _bookmarks.isEmpty
          ? const Center(
        child: Text(
          'No bookmarks yet.',
          style: TextStyle(fontSize: 16, color: Colors.grey),
        ),
      )
          : Stack(
        children: [
          ListView.builder(
            controller: _scrollController,
            padding: const EdgeInsets.all(12),
            itemCount: _bookmarks.length,
            itemBuilder: (context, index) {
              final item = _bookmarks[index];
              return Card(
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
                margin: const EdgeInsets.symmetric(vertical: 8),
                elevation: 2,
                child: ListTile(
                  leading: const Icon(Icons.bookmark, color: Colors.deepPurple),
                  title: Text(item['name']),
                  subtitle: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(item['location']),
                      if (item['price'] != null)
                        Text('€${item['price']}'),
                      const SizedBox(height: 4),
                      Text(
                        item['storeName'] ?? 'Unknown Store',
                        style: const TextStyle(
                          fontWeight: FontWeight.bold,
                          color: Colors.black87,
                        ),
                      ),
                    ],
                  ),
                  trailing: IconButton(
                    icon: const Icon(Icons.delete, color: Colors.red),
                    onPressed: () => _removeBookmark(item),
                  ),
                ),
              );
            },
          ),
          if (_showClearButton)
            Positioned(
              bottom: 20,
              right: 20,
              child: FloatingActionButton.extended(
                onPressed: _clearAllBookmarks,
                backgroundColor: Colors.red[600],
                icon: const Icon(Icons.delete_forever, color: Colors.white),
                label: const Text('Clear All', style: TextStyle(color: Colors.white)),
              ),
            ),
        ],
      ),
    );
  }
}
