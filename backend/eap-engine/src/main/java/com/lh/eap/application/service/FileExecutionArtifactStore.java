package com.lh.eap.application.service;

import com.lh.eap.api.CliExecution;
import java.nio.file.*;
import java.io.IOException;
import java.security.*;
import java.util.*;

/** Trusted local root; no deletion, no arbitrary provider paths or existing-file overwrite. */
public final class FileExecutionArtifactStore implements ExecutionArtifactStore {
    private final Path root;
    public FileExecutionArtifactStore(Path root){this.root=root.toAbsolutePath().normalize();}
    @Override public synchronized CliExecution.Artifact save(UUID executionId,String kind,byte[] content)throws IOException{
        if(!Set.of("codex-jsonl","stderr","process-trace","ai-trace").contains(kind))throw new IOException("Invalid artifact kind");
        var parent=root.getParent().toRealPath();
        ensureDirectory(root);
        if(!root.toRealPath().equals(parent.resolve(root.getFileName())))throw new IOException("Artifact root escape");
        var dir=root.resolve(executionId.toString());
        ensureDirectory(dir);
        if(!dir.toRealPath().equals(root.toRealPath().resolve(executionId.toString())))throw new IOException("Artifact execution escape");
        var id=UUID.randomUUID();var path=dir.resolve(id+".json");
        Files.write(path,content,StandardOpenOption.CREATE_NEW);
        try{
            return new CliExecution.Artifact(id,executionId,kind,root.relativize(path).toString().replace('\\','/'),
                    HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(content)),content.length);
        }catch(NoSuchAlgorithmException impossible){throw new IOException(impossible);}
    }
    private static void ensureDirectory(Path path)throws IOException{
        try{Files.createDirectory(path);}catch(FileAlreadyExistsException existing){
            if(!Files.isDirectory(path))throw existing;
        }
    }
}
