import 'package:camera/camera.dart';
import 'package:flutter/material.dart';

class ReceiptCameraCaptureScreen extends StatefulWidget {
  const ReceiptCameraCaptureScreen({super.key});

  @override
  State<ReceiptCameraCaptureScreen> createState() =>
      _ReceiptCameraCaptureScreenState();
}

class _ReceiptCameraCaptureScreenState
    extends State<ReceiptCameraCaptureScreen> {
  CameraController? _controller;
  Future<void>? _initializeCameraFuture;
  bool _capturing = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _initializeCameraFuture = _initializeCamera();
  }

  Future<void> _initializeCamera() async {
    try {
      final cameras = await availableCameras();
      if (cameras.isEmpty) {
        throw CameraException('no_camera', 'No camera found on this device.');
      }

      final backCamera = cameras.firstWhere(
        (camera) => camera.lensDirection == CameraLensDirection.back,
        orElse: () => cameras.first,
      );

      final controller = CameraController(
        backCamera,
        ResolutionPreset.high,
        enableAudio: false,
        imageFormatGroup: ImageFormatGroup.jpeg,
      );

      await controller.initialize();

      if (!mounted) {
        await controller.dispose();
        return;
      }

      setState(() => _controller = controller);
    } catch (e) {
      if (mounted) {
        setState(() => _error = 'Could not open the back camera.');
      }
    }
  }

  Future<void> _takePhoto() async {
    final controller = _controller;
    if (controller == null || _capturing || !controller.value.isInitialized) {
      return;
    }

    setState(() => _capturing = true);

    try {
      final photo = await controller.takePicture();
      if (!mounted) return;
      Navigator.of(context).pop(photo.path);
    } catch (e) {
      if (mounted) {
        setState(() => _capturing = false);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not take receipt photo.')),
        );
      }
    }
  }

  @override
  void dispose() {
    _controller?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        centerTitle: true,
        title: const Text(
          'Receipt Photo',
          style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800),
        ),
        backgroundColor: Colors.black,
        iconTheme: const IconThemeData(color: Colors.white),
      ),
      body: FutureBuilder<void>(
        future: _initializeCameraFuture,
        builder: (context, snapshot) {
          if (_error != null) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Text(
                  _error!,
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            );
          }

          final controller = _controller;
          if (snapshot.connectionState != ConnectionState.done ||
              controller == null ||
              !controller.value.isInitialized) {
            return const Center(
              child: CircularProgressIndicator(color: Colors.white),
            );
          }

          return Stack(
            children: [
              Positioned.fill(
                child: FittedBox(
                  fit: BoxFit.cover,
                  child: SizedBox(
                    width: controller.value.previewSize?.height ?? 1,
                    height: controller.value.previewSize?.width ?? 1,
                    child: CameraPreview(controller),
                  ),
                ),
              ),
              Positioned(
                left: 28,
                right: 28,
                top: 34,
                bottom: 112,
                child: IgnorePointer(
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      border: Border.all(color: Colors.white, width: 3),
                      borderRadius: BorderRadius.circular(18),
                    ),
                  ),
                ),
              ),
              Positioned(
                left: 24,
                right: 24,
                bottom: 28,
                child: SafeArea(
                  child: Center(
                    child: FilledButton(
                      onPressed: _capturing ? null : _takePhoto,
                      style: FilledButton.styleFrom(
                        backgroundColor: Colors.white,
                        foregroundColor: Colors.deepPurple,
                        fixedSize: const Size(76, 76),
                        shape: const CircleBorder(),
                      ),
                      child:
                          _capturing
                              ? const SizedBox(
                                width: 24,
                                height: 24,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2.4,
                                ),
                              )
                              : const Icon(Icons.camera_alt, size: 34),
                    ),
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}
