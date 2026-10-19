import 'dart:async';

import 'package:flutter/material.dart';
import 'package:video_player/video_player.dart';

/// Prefer an uploaded cover; older Bites can display a frame from their video.
class BiteVideoCover extends StatelessWidget {
  const BiteVideoCover({
    super.key,
    required this.coverUrl,
    required this.videoUrl,
  });

  final String coverUrl;
  final String videoUrl;

  @override
  Widget build(BuildContext context) {
    final still = _VideoStill(key: ValueKey(videoUrl), url: videoUrl);
    if (coverUrl.isEmpty) return still;
    return Image.network(
      coverUrl,
      fit: BoxFit.cover,
      errorBuilder: (_, _, _) => still,
    );
  }
}

class _VideoStill extends StatefulWidget {
  const _VideoStill({super.key, required this.url});

  final String url;

  @override
  State<_VideoStill> createState() => _VideoStillState();
}

class _VideoStillState extends State<_VideoStill> {
  VideoPlayerController? _controller;
  bool _ready = false;
  bool _failed = false;

  @override
  void initState() {
    super.initState();
    final uri = Uri.tryParse(widget.url);
    if (uri == null ||
        !uri.hasAuthority ||
        (uri.scheme != 'https' && uri.scheme != 'http')) {
      _failed = true;
      return;
    }
    final controller = VideoPlayerController.networkUrl(
      uri,
      videoPlayerOptions: VideoPlayerOptions(mixWithOthers: true),
    );
    _controller = controller;
    unawaited(_load(controller));
  }

  Future<void> _load(VideoPlayerController controller) async {
    try {
      await controller.initialize().timeout(const Duration(seconds: 15));
      if (!mounted) return;
      // Stay paused. Seeking slightly into the clip avoids empty opening frames.
      final duration = controller.value.duration;
      final position = duration > const Duration(milliseconds: 100)
          ? const Duration(milliseconds: 100)
          : Duration.zero;
      await controller.seekTo(position).timeout(const Duration(seconds: 5));
      if (mounted) setState(() => _ready = true);
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _failed = true;
        _controller = null;
      });
      await controller.dispose();
    }
  }

  @override
  void dispose() {
    unawaited(_controller?.dispose());
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final controller = _controller;
    if (_ready && controller != null) {
      return ClipRect(
        child: FittedBox(
          fit: BoxFit.cover,
          child: SizedBox(
            width: controller.value.size.width,
            height: controller.value.size.height,
            child: VideoPlayer(controller),
          ),
        ),
      );
    }
    return ColoredBox(
      color: const Color(0xFF202020),
      child: Center(
        child: _failed
            ? const Icon(Icons.videocam_off_outlined, color: Colors.white54)
            : const SizedBox(
                width: 20,
                height: 20,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  color: Colors.white54,
                ),
              ),
      ),
    );
  }
}
